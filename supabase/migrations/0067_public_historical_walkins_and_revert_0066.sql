-- Migration 67: customer historical walk-ins and removal of admin 0066.

-- 0066 was an unused admin-only implementation. The public customer flow
-- below is the supported historical check-in path.
drop function if exists admin_create_session(uuid, uuid, int, timestamptz);

create or replace function checkin_create_historical_session(
  p_customer_id uuid,
  p_child_ids uuid[],
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_client_key text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad_count int;
  v_already_in_count int;
  v_duration_mins int;
  v_sessions json;
begin
  if not check_rate_limit('historical-session:' || p_client_key, 10, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;
  if p_started_at is null or p_ended_at is null or p_ended_at <= p_started_at then
    raise exception 'End time must be after start time.' using errcode = 'P0001';
  end if;
  if p_ended_at > now() then
    raise exception 'Historical check-in cannot be in the future.' using errcode = 'P0001';
  end if;

  v_duration_mins := floor(extract(epoch from (p_ended_at - p_started_at)) / 60)::int;
  if v_duration_mins < 1 then
    raise exception 'The visit must be at least one minute.' using errcode = 'P0001';
  end if;

  select count(*) into v_bad_count
  from unnest(p_child_ids) as cid
  where not exists (
    select 1 from children c where c.id = cid and c.customer_id = p_customer_id
  );
  if v_bad_count > 0 then
    raise exception 'One or more selected children could not be verified.';
  end if;

  select count(*) into v_already_in_count
  from unnest(p_child_ids) as cid
  where exists (
    select 1 from play_sessions ps where ps.child_id = cid and ps.status = 'active'
  );
  if v_already_in_count > 0 then
    raise exception 'One or more selected children are currently checked in.';
  end if;

  with inserted as (
    insert into play_sessions (child_id, start_time, duration_mins, status, special_pass_id)
    select
      cid,
      p_started_at,
      v_duration_mins,
      'completed'::session_status,
      (
        select csp.id
        from child_special_passes csp
        where csp.child_id = cid
          and csp.event_date = (p_started_at at time zone 'Asia/Kolkata')::date
        limit 1
      )
    from unnest(p_child_ids) as cid
    returning id, child_id, start_time, end_time, status, special_pass_id
  )
  select json_agg(json_build_object(
           'session_id', id,
           'child_id', child_id,
           'start_time', start_time,
           'end_time', end_time,
           'status', status,
           'special_pass_id', special_pass_id
         ))
  into v_sessions
  from inserted;

  return json_build_object('sessions', v_sessions);
end;
$$;

revoke all on function checkin_create_historical_session(uuid, uuid[], timestamptz, timestamptz, text) from public;
grant execute on function checkin_create_historical_session(uuid, uuid[], timestamptz, timestamptz, text) to anon, authenticated;
notify pgrst, 'reload schema';