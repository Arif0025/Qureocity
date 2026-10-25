-- Employee leave requests, salary credits, admin reminders, and review access.

alter table public.app_settings add column if not exists leave_reminder_days integer not null default 1;
alter table public.app_settings drop constraint if exists app_settings_leave_reminder_days_check;
alter table public.app_settings add constraint app_settings_leave_reminder_days_check check (leave_reminder_days between 0 and 60);

create table if not exists public.employee_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  paid_dates date[] not null default '{}',
  paid_shift_hours numeric(6,2),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.employees(id) on delete set null,
  reminder_sent_at timestamptz,
  constraint employee_leave_dates_valid check (end_date >= start_date),
  constraint employee_leave_reason_length check (length(reason) <= 1000),
  constraint employee_leave_note_length check (review_note is null or length(review_note) <= 1000),
  constraint employee_leave_paid_hours_valid check (paid_shift_hours is null or paid_shift_hours >= 0)
);
create index if not exists employee_leave_status_dates_idx on public.employee_leave_requests(status,start_date,end_date);
create index if not exists employee_leave_employee_idx on public.employee_leave_requests(employee_id,created_at desc);
alter table public.employee_leave_requests enable row level security;
revoke all on public.employee_leave_requests from anon,authenticated;
grant select on public.employee_leave_requests to authenticated;
drop policy if exists "admins read leave requests" on public.employee_leave_requests;
create policy "admins read leave requests" on public.employee_leave_requests for select to authenticated using (is_admin_member());
drop policy if exists "employees read own leave requests" on public.employee_leave_requests;
create policy "employees read own leave requests" on public.employee_leave_requests for select to authenticated using (employee_id=auth.uid());

alter table public.notification_rules drop constraint if exists notification_rules_event_type_check;
alter table public.notification_rules add constraint notification_rules_event_type_check check (event_type in (
  'child_checkin','child_checkout','session_ending','session_overdue','staff_punch_in','staff_punch_out',
  'new_registration','party_registration','employee_leave'
));
insert into public.notification_rules(event_type,employee_scope,params) values ('employee_leave','none','{}')
on conflict (event_type) do nothing;

create or replace function public.enforce_employee_leave_admin_only()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.event_type='employee_leave' then
    new.employee_scope:='none';
    new.show_child_name:=false;
  end if;
  return new;
end $$;
drop trigger if exists trg_employee_leave_admin_only on public.notification_rules;
create trigger trg_employee_leave_admin_only before insert or update on public.notification_rules
for each row execute function public.enforce_employee_leave_admin_only();

create or replace function public.employee_submit_leave_request(p_start_date date,p_end_date date,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_today date:=(now() at time zone 'Asia/Kolkata')::date; v_id uuid; v_reason text:=btrim(coalesce(p_reason,''));
begin
  if v_uid is null or not exists(select 1 from employees where id=v_uid) then raise exception 'Not authorized.' using errcode='42501'; end if;
  if p_start_date is null or p_end_date is null or p_start_date<v_today or p_end_date<p_start_date then raise exception 'Choose a valid date range starting today or later.' using errcode='22023'; end if;
  if p_end_date-p_start_date>90 then raise exception 'A request cannot exceed 91 calendar days.' using errcode='22023'; end if;
  if length(v_reason)>1000 then raise exception 'Reason must be 1000 characters or fewer.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if exists(select 1 from employee_leave_requests r where r.employee_id=v_uid and r.status in ('pending','approved') and r.start_date<=p_end_date and r.end_date>=p_start_date) then
    raise exception 'These dates overlap another pending or approved request.' using errcode='23505';
  end if;
  insert into employee_leave_requests(employee_id,start_date,end_date,reason) values(v_uid,p_start_date,p_end_date,v_reason) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end $$;

create or replace function public.employee_leave_overview()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(select 1 from employees where id=v_uid) then raise exception 'Not authorized.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'start_date',r.start_date,'end_date',r.end_date,'reason',r.reason,'status',r.status,'paid_dates',r.paid_dates,'review_note',r.review_note,'created_at',r.created_at) order by r.created_at desc)
    from (select * from employee_leave_requests where employee_id=v_uid order by created_at desc limit 30) r),'[]'::jsonb);
end $$;

create or replace function public.admin_leave_overview()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_admin_member() then raise exception 'Admin access required.' using errcode='42501'; end if;
  return jsonb_build_object(
    'reminder_days',(select leave_reminder_days from app_settings where id=true),
    'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'employee_id',r.employee_id,'employee_name',e.name,'salary_type',e.salary_type,
      'scheduled_shift_hours',(select round(extract(epoch from(s.end_time-s.start_time))/3600.0,2) from shifts s where s.employee_id=e.id),
      'start_date',r.start_date,'end_date',r.end_date,'reason',r.reason,'status',r.status,'paid_dates',r.paid_dates,'review_note',r.review_note,'created_at',r.created_at)
      order by case r.status when 'pending' then 0 else 1 end,r.start_date,r.created_at desc)
      from employee_leave_requests r join employees e on e.id=r.employee_id where r.status='pending' or r.end_date>=v_today-30),'[]'::jsonb)
  );
end $$;

create or replace function public.admin_set_leave_reminder_days(p_days integer)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not is_admin_member() then raise exception 'Admin access required.' using errcode='42501'; end if;
  if p_days is null or p_days<0 or p_days>60 then raise exception 'Reminder days must be between 0 and 60.' using errcode='22023'; end if;
  update app_settings set leave_reminder_days=p_days where id=true;
  return jsonb_build_object('ok',true,'reminder_days',p_days);
end $$;

create or replace function public.admin_review_leave_request(p_request_id uuid,p_decision text,p_paid_dates date[] default '{}',p_review_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_req employee_leave_requests; v_paid date[]:=coalesce(p_paid_dates,'{}'); v_note text:=nullif(btrim(coalesce(p_review_note,'')),''); v_hours numeric(6,2);
begin
  if not is_admin_member() then raise exception 'Admin access required.' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Choose approve or decline.' using errcode='22023'; end if;
  if length(coalesce(v_note,''))>1000 then raise exception 'Review note is too long.' using errcode='22023'; end if;
  select * into v_req from employee_leave_requests where id=p_request_id for update;
  if v_req.id is null then raise exception 'Leave request not found.' using errcode='P0002'; end if;
  if v_req.status<>'pending' then raise exception 'This request has already been reviewed.' using errcode='P0001'; end if;
  if p_decision='approved' then
    if cardinality(v_paid)<>(select count(distinct d) from unnest(v_paid) d) then raise exception 'Paid dates contain duplicates.' using errcode='22023'; end if;
    if exists(select 1 from unnest(v_paid) d where d<v_req.start_date or d>v_req.end_date or extract(dow from d)=2) then
      raise exception 'Paid dates must be working days within the request.' using errcode='22023';
    end if;
    select round(extract(epoch from(s.end_time-s.start_time))/3600.0,2) into v_hours from shifts s where s.employee_id=v_req.employee_id;
  else v_paid:='{}'; v_hours:=null;
  end if;
  update employee_leave_requests set status=p_decision,paid_dates=v_paid,paid_shift_hours=v_hours,review_note=v_note,reviewed_at=now(),reviewed_by=auth.uid() where id=p_request_id;
  insert into employee_notifications(user_id,category,title,body,target_url) values(
    v_req.employee_id,'admin',case when p_decision='approved' then 'Leave request approved' else 'Leave request declined' end,
    format('Your leave from %s to %s was %s.',v_req.start_date,v_req.end_date,case when p_decision='approved' then 'approved' else 'declined' end),
    '/employee?tab=activity'
  );
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.process_leave_reminders()
returns integer language plpgsql security definer set search_path=public as $$
declare v_today date:=(now() at time zone 'Asia/Kolkata')::date; v_days integer; v_row record; v_count integer:=0;
begin
  select leave_reminder_days into v_days from app_settings where id=true; v_days:=coalesce(v_days,1);
  for v_row in select r.id,r.start_date,r.end_date,r.status,e.name from employee_leave_requests r join employees e on e.id=r.employee_id
    where r.status in ('pending','approved') and r.start_date=v_today+v_days and r.reminder_sent_at is null for update of r skip locked
  loop
    update employee_leave_requests set reminder_sent_at=now() where id=v_row.id;
    insert into employee_notifications(user_id,category,title,body,target_url)
      select e.id,'admin','Upcoming staff leave',format('%s has leave starting %s (%s).',v_row.name,v_row.start_date,v_row.status),'/admin?tab=notifications'
      from employees e where e.role='admin';
    perform push_enqueue('employee_leave',jsonb_build_object('leave_request_id',v_row.id,'kind','reminder'));
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

create or replace function public.trg_employee_leave_submitted()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
  select name into v_name from employees where id=new.employee_id;
  insert into employee_notifications(user_id,category,title,body,target_url)
    select e.id,'admin','Staff leave request',format('%s requested leave from %s to %s.',v_name,new.start_date,new.end_date),'/admin?tab=notifications'
    from employees e where e.role='admin';
  perform push_enqueue('employee_leave',jsonb_build_object('leave_request_id',new.id,'kind','request'));
  return new;
end $$;
drop trigger if exists trg_employee_leave_submitted on public.employee_leave_requests;
create trigger trg_employee_leave_submitted after insert on public.employee_leave_requests
for each row execute function public.trg_employee_leave_submitted();

create or replace function public.push_event_context(p_event text,p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_rule notification_rules; v_ctx jsonb:='{}'::jsonb;
begin
  select * into v_rule from notification_rules where event_type=p_event;
  if v_rule.event_type is null then return null; end if;
  if p_event in ('child_checkin','child_checkout','session_ending','session_overdue') then
    select jsonb_build_object('session_id',ps.id,'child_name',c.name,'parent_name',cu.name,'customer_phone',cu.phone,'date_of_birth',c.date_of_birth,'start_time',ps.start_time,'end_time',ps.end_time,'ended_at',ps.ended_at,'duration_mins',ps.duration_mins,
      'minutes_left',case when ps.end_time is null then null else greatest(0,ceil(extract(epoch from(ps.end_time-now()))/60))::int end,
      'minutes_overdue',case when ps.end_time is null then null else greatest(0,floor(extract(epoch from(now()-ps.end_time))/60))::int end,
      'staff_on_site',(select coalesce(jsonb_agg(e.name order by e.name),'[]'::jsonb) from attendance_logs al join employees e on e.id=al.employee_id where al.punch_out is null))
    into v_ctx from play_sessions ps join children c on c.id=ps.child_id join customers cu on cu.id=c.customer_id where ps.id=(p_payload->>'session_id')::uuid;
  elsif p_event in ('staff_punch_in','staff_punch_out') then
    select jsonb_build_object('employee_id',e.id,'employee_name',e.name,'punch_in',al.punch_in,'punch_out',al.punch_out,'auto',coalesce(al.auto_punched_out,false))
    into v_ctx from attendance_logs al join employees e on e.id=al.employee_id where al.id=(p_payload->>'log_id')::uuid;
  elsif p_event='new_registration' then
    select jsonb_build_object('registration_id',r.id,'registration_type',r.registration_type,'child_name',r.child_name,'parent_name',r.parent_name,
      'plan_name',coalesce(p.name,'No plan selected'),'receipt_number',r.receipt_number,'event_date',coalesce(r.special_event_date,r.plan_event_date))
    into v_ctx from membership_registrations r left join membership_plans p on p.id=r.plan_id where r.id=(p_payload->>'registration_id')::uuid and r.status='pending';
  elsif p_event='party_registration' then
    select jsonb_build_object('booking_id',b.id,'child_name',b.child_name,'parent_name',b.parent_name,'plan_name',b.plan_name,'starts_at',b.starts_at)
    into v_ctx from party_bookings b where b.id=(p_payload->>'booking_id')::uuid and b.status='pending';
  elsif p_event='employee_leave' then
    select jsonb_build_object('leave_request_id',r.id,'employee_name',e.name,'leave_start_date',r.start_date,'leave_end_date',r.end_date,'leave_status',r.status,'leave_kind',coalesce(p_payload->>'kind','request'))
    into v_ctx from employee_leave_requests r join employees e on e.id=r.employee_id where r.id=(p_payload->>'leave_request_id')::uuid and r.status in ('pending','approved');
  end if;
  if v_ctx is null or v_ctx='{}'::jsonb then return null; end if;
  return v_ctx||jsonb_build_object('rule',jsonb_build_object('show_child_name',v_rule.show_child_name,'employee_scope',v_rule.employee_scope,'params',v_rule.params));
end $$;
revoke all on function public.push_event_context(text,jsonb) from public,anon,authenticated;
grant execute on function public.push_event_context(text,jsonb) to service_role;

create or replace function public.admin_staff_attendance_summary(
  p_month_start date default date_trunc('month',now() at time zone 'Asia/Kolkata')::date,
  p_employee_id uuid default null
)
returns json language sql stable set search_path=public as $$
with requested as (select case when is_admin_member() then p_employee_id else auth.uid() end employee_id),
bounds as (select p_month_start month_start,(p_month_start+interval '1 month')::date month_end_excl,
  least((p_month_start+interval '1 month')::date,((now() at time zone 'Asia/Kolkata')::date+1)) to_date_excl),
open_days as (select count(*) open_day_count from bounds,generate_series(bounds.month_start,bounds.to_date_excl-1,interval '1 day') d where extract(dow from d)<>2)
select coalesce(json_agg(row_data order by(row_data->>'employee_name')),'[]'::json) from (
 select json_build_object('employee_id',e.id,'employee_name',e.name,'role',e.role,
  'actual_working_days',(select count(distinct((al.punch_in at time zone 'Asia/Kolkata')::date)) from attendance_logs al,bounds
    where al.employee_id=e.id and al.punch_in >= (bounds.month_start::timestamp at time zone 'Asia/Kolkata') and al.punch_in < (bounds.month_end_excl::timestamp at time zone 'Asia/Kolkata') and extract(dow from(al.punch_in at time zone 'Asia/Kolkata'))<>2),
  'total_hours_this_month',(select coalesce(sum(round(extract(epoch from(coalesce(al.punch_out,now())-al.punch_in))/1800)*0.5),0) from attendance_logs al,bounds
    where al.employee_id=e.id and al.punch_in >= (bounds.month_start::timestamp at time zone 'Asia/Kolkata') and al.punch_in < (bounds.month_end_excl::timestamp at time zone 'Asia/Kolkata') and extract(dow from(al.punch_in at time zone 'Asia/Kolkata'))<>2),
  'paid_leave_hours_this_month',(select coalesce(sum(coalesce(r.paid_shift_hours,0)),0) from employee_leave_requests r cross join lateral unnest(r.paid_dates) paid(day)
    where r.employee_id=e.id and r.status='approved' and paid.day >= (select month_start from bounds) and paid.day < (select to_date_excl from bounds)
    and extract(dow from paid.day)<>2 and not exists(select 1 from attendance_logs al where al.employee_id=e.id and (al.punch_in at time zone 'Asia/Kolkata')::date=paid.day)),
  'paid_leave_days_this_month',(select count(*) from employee_leave_requests r cross join lateral unnest(r.paid_dates) paid(day)
    where r.employee_id=e.id and r.status='approved' and paid.day >= (select month_start from bounds) and paid.day < (select to_date_excl from bounds)
    and extract(dow from paid.day)<>2 and not exists(select 1 from attendance_logs al where al.employee_id=e.id and (al.punch_in at time zone 'Asia/Kolkata')::date=paid.day)),
  'scheduled_hours_this_month',(select case when s.id is null then null else round(extract(epoch from(s.end_time-s.start_time))/3600.0*(select open_day_count from open_days),1) end from shifts s where s.employee_id=e.id),
  'working_days_this_month',(select open_day_count from open_days)) row_data
 from employees e,requested where requested.employee_id is null or e.id=requested.employee_id
) results
$$;

revoke all on function public.employee_submit_leave_request(date,date,text) from public,anon;
revoke all on function public.employee_leave_overview() from public,anon;
revoke all on function public.admin_leave_overview() from public,anon;
revoke all on function public.admin_set_leave_reminder_days(integer) from public,anon;
revoke all on function public.admin_review_leave_request(uuid,text,date[],text) from public,anon;
revoke all on function public.process_leave_reminders() from public,anon,authenticated;
grant execute on function public.employee_submit_leave_request(date,date,text) to authenticated;
grant execute on function public.employee_leave_overview() to authenticated;
grant execute on function public.admin_leave_overview() to authenticated;
grant execute on function public.admin_set_leave_reminder_days(integer) to authenticated;
grant execute on function public.admin_review_leave_request(uuid,text,date[],text) to authenticated;
grant execute on function public.process_leave_reminders() to service_role;
grant execute on function public.admin_staff_attendance_summary(date,uuid) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='employee_leave_requests') then
    alter publication supabase_realtime add table public.employee_leave_requests;
  end if;
end $$;
notify pgrst,'reload schema';

