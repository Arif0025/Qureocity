-- =====================================================================
-- Migration 18: prevent double check-in for the same child
-- =====================================================================
-- Bug: checkin_lookup never told the client which children already had
-- an active session, so the returning-customer screen let staff select
-- (and submit) a child who was already checked in, creating a second
-- concurrent active play_sessions row for the same kid.
--
-- Two-part fix: expose the status so the UI can show/disable it, AND
-- enforce it server-side in checkin_create_sessions so this is blocked
-- no matter which screen submits the request (the phone-based flow,
-- Quick Check-In, or anything added later).

create or replace function checkin_lookup(p_phone text, p_client_key text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer customers;
  v_children json;
begin
  if not check_rate_limit('lookup:' || p_client_key, 8, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  select * into v_customer from customers where phone = p_phone;

  if v_customer.id is null then
    return json_build_object('found', false);
  end if;

  select json_agg(json_build_object(
           'id', c.id,
           'name', c.name,
           'age', date_part('year', age(current_date, c.date_of_birth)),
           'currently_checked_in', exists(
             select 1 from play_sessions ps where ps.child_id = c.id and ps.status = 'active'
           )
         ))
  into v_children
  from children c
  where c.customer_id = v_customer.id;

  return json_build_object(
    'found', true,
    'customer_id', v_customer.id,
    'parent_name', v_customer.name,
    'children', coalesce(v_children, '[]'::json)
  );
end;
$$;

create or replace function checkin_create_sessions(
  p_customer_id uuid,
  p_child_ids uuid[],
  p_duration_mins int,
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
  v_sessions json;
begin
  if not check_rate_limit('session:' || p_client_key, 10, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_bad_count
  from unnest(p_child_ids) as cid
  where not exists (
    select 1 from children c where c.id = cid and c.customer_id = p_customer_id
  );

  if v_bad_count > 0 then
    raise exception 'One or more selected children could not be verified.';
  end if;

  -- The actual fix: reject outright if any selected child already has
  -- an active session, instead of silently creating a second one.
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
    insert into play_sessions (child_id, duration_mins)
    select cid, p_duration_mins from unnest(p_child_ids) as cid
    returning id, child_id, start_time, end_time
  )
  select json_agg(json_build_object(
           'session_id', i.id,
           'child_id', i.child_id,
           'start_time', i.start_time,
           'end_time', i.end_time
         ))
  into v_sessions
  from inserted i;

  return json_build_object('sessions', v_sessions);
end;
$$;