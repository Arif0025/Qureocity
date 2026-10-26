-- Allow staff to add one of the supported increments to an active timed walk-in.
create or replace function public.staff_extend_walkin_session(
  p_session_id uuid,
  p_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.play_sessions%rowtype;
  v_visit_day date;
  v_end_time timestamptz;
begin
  if not is_staff_member() then raise exception 'Staff access required.' using errcode='42501'; end if;
  if p_minutes is null or p_minutes not in (30,45,60) then
    raise exception 'Choose 30 minutes, 45 minutes, or 1 hour.' using errcode='22023';
  end if;

  select * into v_session from public.play_sessions where id=p_session_id for update;
  if not found or v_session.status<>'active' then raise exception 'This session is no longer active.' using errcode='P0002'; end if;
  if v_session.special_pass_id is not null then raise exception 'Special-pass sessions cannot be extended here.' using errcode='22023'; end if;
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

  v_end_time:=v_session.start_time+make_interval(mins=>v_session.duration_mins+p_minutes);
  update public.play_sessions
  set duration_mins=v_session.duration_mins+p_minutes,
      end_time=v_end_time
  where id=p_session_id;
  return jsonb_build_object('ok',true,'added_minutes',p_minutes,'end_time',v_end_time);
end $$;

revoke all on function public.staff_extend_walkin_session(uuid,integer) from public,anon;
grant execute on function public.staff_extend_walkin_session(uuid,integer) to authenticated;
notify pgrst,'reload schema';
