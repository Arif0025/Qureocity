-- =====================================================================
-- Migration 25: staff-confirmed check-ins + attendance calc corrections
-- =====================================================================
-- Part A: kiosk self-check-in no longer goes straight to 'active'. It
-- lands in 'pending_payment' and only becomes 'active' once a staff
-- member (employee or admin) confirms payment was collected in person.
-- Quick Check-In (staff-initiated, gated on an already-active
-- subscription) skips this — payment is already accounted for there.
--
-- Part B: admin_staff_attendance_summary gets three corrections:
--   1. IST-aware day boundaries (was using session/UTC dates, causing
--      the calendar-vs-detail-panel date mismatch).
--   2. Tuesdays (venue closed) excluded from working days and hours.
--   3. Durations rounded to the nearest half hour, not the second.
--   Plus a new scheduled_hours_this_month figure (shift duration ×
--   open days-to-date) so actual can be compared against expected.
-- =====================================================================

-- Part A1 (new session_status enum values) now lives in
-- 0025a_add_session_status_values.sql — must be run and committed
-- BEFORE this file.

-- ---------------------------------------------------------------------
-- Part A2: checkin_create_sessions gains a p_status param.
-- Kiosk callers omit it (defaults to pending_payment). QuickCheckin.tsx
-- passes p_status => 'active' explicitly since subscription = prepaid.
-- ---------------------------------------------------------------------
create or replace function checkin_create_sessions(
  p_customer_id uuid,
  p_child_ids uuid[],
  p_duration_mins int,
  p_client_key text,
  p_status session_status default 'pending_payment'
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

  if p_status not in ('pending_payment', 'active') then
    raise exception 'Invalid initial session status.';
  end if;

  select count(*) into v_bad_count
  from unnest(p_child_ids) as cid
  where not exists (
    select 1 from children c where c.id = cid and c.customer_id = p_customer_id
  );

  if v_bad_count > 0 then
    raise exception 'One or more selected children could not be verified.';
  end if;

  -- "already checked in" now means active OR still pending confirmation —
  -- otherwise the same child could be queued twice while the first
  -- request is still sitting unconfirmed.
  select count(*) into v_already_in_count
  from unnest(p_child_ids) as cid
  where exists (
    select 1 from play_sessions ps
    where ps.child_id = cid and ps.status in ('active', 'pending_payment')
  );

  if v_already_in_count > 0 then
    raise exception 'One or more selected children are already checked in.';
  end if;

  if p_duration_mins is not null and p_duration_mins not in (60, 120) then
    raise exception 'Invalid duration.';
  end if;

  with inserted as (
    insert into play_sessions (child_id, duration_mins, status)
    select cid, p_duration_mins, p_status from unnest(p_child_ids) as cid
    returning id, child_id, start_time, end_time, status
  )
  select json_agg(json_build_object(
           'session_id', i.id,
           'child_id', i.child_id,
           'start_time', i.start_time,
           'end_time', i.end_time,
           'status', i.status
         ))
  into v_sessions
  from inserted i;

  return json_build_object('sessions', v_sessions);
end;
$$;

grant execute on function checkin_create_sessions(uuid, uuid[], int, text, session_status) to anon, authenticated;

-- checkin_lookup should treat a pending child as "already in the
-- system" too, so the kiosk can't queue the same kid a second time
-- while their first request is still awaiting confirmation.
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
             select 1 from play_sessions ps
             where ps.child_id = c.id and ps.status in ('active', 'pending_payment')
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

-- ---------------------------------------------------------------------
-- Part A3: staff confirm / discard RPCs — atomic, race-safe.
-- The WHERE status = 'pending_payment' clause is the actual guarantee:
-- if two staff members tap at once, only one UPDATE matches a row.
-- ---------------------------------------------------------------------
create or replace function confirm_pending_session(p_session_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row play_sessions;
begin
  if not (is_staff_member() or is_admin_member()) then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  update play_sessions
  set status = 'active'
  where id = p_session_id and status = 'pending_payment'
  returning * into v_row;

  if v_row.id is null then
    return json_build_object('success', false, 'reason', 'already_handled');
  end if;

  return json_build_object('success', true, 'session_id', v_row.id);
end;
$$;

create or replace function discard_pending_session(p_session_id uuid, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row play_sessions;
begin
  if not (is_staff_member() or is_admin_member()) then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  update play_sessions
  set status = 'discarded'
  where id = p_session_id and status = 'pending_payment'
  returning * into v_row;

  if v_row.id is null then
    return json_build_object('success', false, 'reason', 'already_handled');
  end if;

  return json_build_object('success', true, 'session_id', v_row.id);
end;
$$;

grant execute on function confirm_pending_session(uuid) to authenticated;
grant execute on function discard_pending_session(uuid, text) to authenticated;

-- Convenience read for the Pending Confirmations panel (realtime patches
-- the list live; this is the initial load / manual refresh path).
create or replace function list_pending_sessions()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(json_agg(json_build_object(
           'session_id', ps.id,
           'child_id', ps.child_id,
           'child_name', c.name,
           'parent_name', cu.name,
           'parent_phone', cu.phone,
           'start_time', ps.start_time,
           'duration_mins', ps.duration_mins
         ) order by ps.start_time), '[]'::json)
  from play_sessions ps
  join children c on c.id = ps.child_id
  join customers cu on cu.id = c.customer_id
  where ps.status = 'pending_payment';
$$;

grant execute on function list_pending_sessions() to authenticated;

-- ---------------------------------------------------------------------
-- Part B: attendance summary corrections
-- ---------------------------------------------------------------------
drop function if exists admin_staff_attendance_summary(date, uuid);

create or replace function admin_staff_attendance_summary(
  p_month_start date default date_trunc('month', current_date)::date,
  p_employee_id uuid default null
)
returns json
language sql
stable
as $$
  with bounds as (
    select
      p_month_start as month_start,
      (p_month_start + interval '1 month')::date as month_end_excl,
      least((p_month_start + interval '1 month')::date, (current_date + 1)) as to_date_excl
  ),
  open_days as (
    -- every calendar day in the month, up to today, excluding Tuesdays
    -- (dow = 2). This mirrors the client-side CLOSED_WEEKDAY = 2 rule.
    select count(*) as open_day_count
    from bounds, generate_series(bounds.month_start, bounds.to_date_excl - 1, interval '1 day') as d
    where extract(dow from d) <> 2
  )
  select coalesce(json_agg(row_data order by (row_data->>'employee_name')), '[]'::json)
  from (
    select json_build_object(
      'employee_id', e.id,
      'employee_name', e.name,
      'role', e.role,
      'actual_working_days', (
        select count(distinct date(al.punch_in at time zone 'Asia/Kolkata'))
        from attendance_logs al, bounds
        where al.employee_id = e.id
          and al.punch_in >= bounds.month_start
          and al.punch_in < bounds.month_end_excl
          and extract(dow from (al.punch_in at time zone 'Asia/Kolkata')) <> 2
      ),
      'total_hours_this_month', (
        select coalesce(
          sum(
            round(
              (extract(epoch from (coalesce(al.punch_out, now()) - al.punch_in)) / 1800)
            ) * 0.5
          ),
          0
        )
        from attendance_logs al, bounds
        where al.employee_id = e.id
          and al.punch_in >= bounds.month_start
          and al.punch_in < bounds.month_end_excl
          and extract(dow from (al.punch_in at time zone 'Asia/Kolkata')) <> 2
      ),
      'scheduled_hours_this_month', (
        select case
          when s.id is null then null
          else round(
            (extract(epoch from (s.end_time - s.start_time)) / 3600.0)
            * (select open_day_count from open_days),
            1
          )
        end
        from shifts s
        where s.employee_id = e.id
      ),
      'working_days_this_month', (select open_day_count from open_days)
    ) as row_data
    from employees e
    where p_employee_id is null or e.id = p_employee_id
  ) results;
$$;

grant execute on function admin_staff_attendance_summary(date, uuid) to authenticated;