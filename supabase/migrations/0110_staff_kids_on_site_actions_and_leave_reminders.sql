-- Let authenticated staff correct an active check-in from Kids on site.
create or replace function public.staff_correct_active_session_checkin(
  p_session_id uuid,
  p_started_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.play_sessions%rowtype;
  v_today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_staff_member() then raise exception 'Staff access required.' using errcode='42501'; end if;
  if p_session_id is null or p_started_at is null then raise exception 'Choose a check-in time.' using errcode='22023'; end if;
  if p_started_at>now() then raise exception 'Check-in time cannot be in the future.' using errcode='22023'; end if;
  if (p_started_at at time zone 'Asia/Kolkata')::date<>v_today then
    raise exception 'Check-in time must be today.' using errcode='22023';
  end if;
  select * into v_session from public.play_sessions where id=p_session_id for update;
  if not found or v_session.status<>'active' then raise exception 'This session is no longer active.' using errcode='P0002'; end if;

  update public.play_sessions
  set start_time=p_started_at,
      end_time=case when v_session.duration_mins is null then null
        else p_started_at+make_interval(mins=>v_session.duration_mins) end
  where id=p_session_id;
  return jsonb_build_object('ok',true,'session_id',p_session_id);
end $$;
revoke all on function public.staff_correct_active_session_checkin(uuid,timestamptz) from public,anon;
grant execute on function public.staff_correct_active_session_checkin(uuid,timestamptz) to authenticated;

-- One-hour extensions are restricted server-side to active walk-in sessions.
create or replace function public.staff_extend_walkin_session_hour(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.play_sessions%rowtype;
  v_visit_day date;
begin
  if not is_staff_member() then raise exception 'Staff access required.' using errcode='42501'; end if;
  select * into v_session from public.play_sessions where id=p_session_id for update;
  if not found or v_session.status<>'active' then raise exception 'This session is no longer active.' using errcode='P0002'; end if;
  if v_session.special_pass_id is not null then raise exception 'Only walk-in sessions can be extended here.' using errcode='22023'; end if;
  if v_session.duration_mins is null then raise exception 'This session has no timed checkout to extend.' using errcode='22023'; end if;
  v_visit_day:=(v_session.start_time at time zone 'Asia/Kolkata')::date;
  if exists(
    select 1 from public.child_subscriptions cs
    where cs.child_id=v_session.child_id
      and cs.started_on<=v_visit_day
      and public.child_membership_is_active(cs.active,cs.expires_on,cs.max_visits,cs.visits_used,v_visit_day)
  ) then
    raise exception 'Only walk-in sessions can be extended here.' using errcode='22023';
  end if;

  update public.play_sessions
  set duration_mins=v_session.duration_mins+60,
      end_time=v_session.start_time+make_interval(mins=>v_session.duration_mins+60)
  where id=p_session_id;
  return jsonb_build_object('ok',true,'end_time',v_session.start_time+make_interval(mins=>v_session.duration_mins+60));
end $$;
revoke all on function public.staff_extend_walkin_session_hour(uuid) from public,anon;
grant execute on function public.staff_extend_walkin_session_hour(uuid) to authenticated;

-- Employee leave reminders can target the employee taking leave while the
-- existing employee_leave rule continues to route request alerts to admins.
create or replace function public.push_resolve_recipients(
  p_event text,
  p_exclude_user uuid,
  p_target_user uuid
)
returns table (
  user_id uuid,
  role text,
  endpoint text,
  p256dh text,
  auth_secret text,
  device_label text
)
language sql
stable
security definer
set search_path=public
as $$
  select s.user_id,e.role::text,s.endpoint,s.p256dh,s.auth_secret,s.device_label
  from public.notification_rules r
  join public.notification_preferences np on np.event_type=r.event_type and np.enabled
  join public.employees e on e.id=np.user_id
  join public.push_subscriptions s on s.user_id=e.id
  where r.event_type=p_event
    and r.enabled
    and (p_exclude_user is null or e.id<>p_exclude_user)
    and (
      e.role='admin'
      or (p_event='employee_leave' and p_target_user is not null and e.id=p_target_user)
      or r.employee_scope='all'
      or (r.employee_scope='on_duty' and exists(
        select 1 from public.attendance_logs al where al.employee_id=e.id and al.punch_out is null
      ))
    );
$$;
revoke all on function public.push_resolve_recipients(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.push_resolve_recipients(text,uuid,uuid) to service_role;

-- Reminders already reach admins; add an in-app reminder for the employee
-- whose pending or approved leave begins on the configured reminder date.
create or replace function public.process_leave_reminders()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_today date:=(now() at time zone 'Asia/Kolkata')::date;
  v_days integer;
  v_row record;
  v_count integer:=0;
  v_when text;
begin
  select leave_reminder_days into v_days from public.app_settings where id=true;
  v_days:=coalesce(v_days,1);
  v_when:=case when v_days=0 then 'today' else format('in %s day%s',v_days,case when v_days=1 then '' else 's' end) end;
  for v_row in
    select r.id,r.employee_id,r.start_date,r.end_date,r.status,e.name
    from public.employee_leave_requests r
    join public.employees e on e.id=r.employee_id
    where r.status in ('pending','approved')
      and r.start_date=v_today+v_days
      and r.reminder_sent_at is null
    for update of r skip locked
  loop
    update public.employee_leave_requests set reminder_sent_at=now() where id=v_row.id;
    insert into public.employee_notifications(user_id,category,title,body,target_url)
    select e.id,'admin','Upcoming staff leave',
      format('%s has %s leave from %s to %s (%s).',v_row.name,v_row.status,v_row.start_date,v_row.end_date,v_when),
      '/admin?tab=notifications'
    from public.employees e where e.role='admin';
    insert into public.employee_notifications(user_id,category,title,body,target_url)
    values(v_row.employee_id,'system','Upcoming leave reminder',
      format('Your %s leave from %s to %s starts %s.',v_row.status,v_row.start_date,v_row.end_date,v_when),
      '/employee?tab=activity');
    perform public.push_enqueue('employee_leave',jsonb_build_object('leave_request_id',v_row.id,'kind','reminder'));
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.process_leave_reminders() from public,anon,authenticated;
grant execute on function public.process_leave_reminders() to service_role;
notify pgrst,'reload schema';
