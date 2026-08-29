-- =====================================================================
-- Migration 46: activate walk-ins immediately
-- =====================================================================
-- Membership registrations and renewals retain their own pending-review
-- workflow in membership_registrations. Ordinary visits should appear on
-- the live floor as soon as the check-in kiosk submits them.

update play_sessions
set status = 'active'
where status = 'pending_payment';

create or replace function checkin_create_sessions(
  p_customer_id uuid,
  p_child_ids uuid[],
  p_duration_mins int,
  p_client_key text,
  p_status session_status default 'active'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad_count int;
  v_already_in_count int;
  v_sessions json;
begin
  if not check_rate_limit('session:' || p_client_key, 10, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  -- Walk-in sessions are always immediately live. Membership review is
  -- intentionally handled by membership_registrations, not this table.
  if p_status <> 'active' then
    raise exception 'Walk-in sessions are recorded as active.';
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
    raise exception 'One or more selected children are already checked in.';
  end if;

  if p_duration_mins is not null and p_duration_mins not in (60, 120) then
    raise exception 'Invalid duration.';
  end if;

  with inserted as (
    insert into play_sessions (child_id, duration_mins, status, special_pass_id)
    select
      cid,
      p_duration_mins,
      'active'::session_status,
      (
        select csp.id
        from child_special_passes csp
        where csp.child_id = cid
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
        limit 1
      )
    from unnest(p_child_ids) as cid
    returning id, child_id, start_time, end_time, status, special_pass_id
  )
  select json_agg(json_build_object(
           'session_id', i.id,
           'child_id', i.child_id,
           'start_time', i.start_time,
           'end_time', i.end_time,
           'status', i.status,
           'special_pass_id', i.special_pass_id
         ))
  into v_sessions
  from inserted i;

  return json_build_object('sessions', v_sessions);
end;
$$;

grant execute on function checkin_create_sessions(uuid, uuid[], int, text, session_status) to anon, authenticated;
