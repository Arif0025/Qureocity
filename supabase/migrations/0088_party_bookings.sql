-- Party booking requests. Pending and confirmed reservations hold the slot;
-- cancelled reservations release it. The booking RPC takes a transaction
-- advisory lock so two simultaneous requests cannot claim the same area.
create table if not exists party_bookings (
  id uuid primary key default gen_random_uuid(),
  party_plan_id uuid references party_plans(id) on delete set null,
  plan_name text not null,
  plan_price numeric(10, 2),
  area_type text not null check (area_type in ('party_room', 'entire_play_area')),
  kids_count integer not null check (kids_count >= 0),
  adults_count integer not null check (adults_count >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  parent_name text not null,
  phone text not null,
  child_name text not null,
  custom_request boolean not null default false,
  request_message text,
  admin_quote numeric(10, 2) check (admin_quote is null or admin_quote >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'quoted', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint party_bookings_positive_duration check (ends_at > starts_at)
);

-- Also upgrade databases where an earlier version of this migration stopped
-- after creating the table and policies.
alter table party_bookings
  add column if not exists custom_request boolean not null default false,
  add column if not exists request_message text,
  add column if not exists admin_quote numeric(10, 2);
alter table party_bookings alter column plan_price drop not null;
alter table party_bookings drop constraint if exists party_bookings_status_check;
alter table party_bookings add constraint party_bookings_status_check
  check (status in ('pending', 'quoted', 'confirmed', 'cancelled'));

drop index if exists party_bookings_schedule_idx;
create index party_bookings_schedule_idx
  on party_bookings (starts_at, ends_at)
  where status in ('pending', 'quoted', 'confirmed');
create index if not exists party_bookings_admin_list_idx
  on party_bookings (status, starts_at desc);

alter table party_bookings enable row level security;
drop policy if exists "admins can read party bookings" on party_bookings;
drop policy if exists "admins can update party bookings" on party_bookings;
create policy "admins can read party bookings" on party_bookings
  for select to authenticated using (is_admin_member());
create policy "admins can update party bookings" on party_bookings
  for update to authenticated using (is_admin_member()) with check (is_admin_member());
grant select, update on party_bookings to authenticated;

-- Remove the initial two-argument overloads so callers cannot keep using
-- availability/registration logic that predates configurable booking rules.
drop function if exists check_party_booking_availability(uuid, timestamptz);
drop function if exists party_slot_is_available(uuid, timestamptz);
drop function if exists register_party_booking(uuid, text, text, text, timestamptz, text);

create or replace function party_slot_is_available(
  p_plan_id uuid,
  p_start_at timestamptz,
  p_duration_minutes integer default null,
  p_area_type text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan party_plans;
  v_end_at timestamptz;
  v_duration integer;
  v_area text;
begin
  if p_start_at is null or p_start_at <= now() then return false; end if;
  if p_plan_id is not null then
    select * into v_plan from party_plans where id = p_plan_id and active = true;
    if v_plan.id is null then return false; end if;
    v_duration := v_plan.duration_minutes;
    v_area := v_plan.area_type;
  else
    v_duration := p_duration_minutes;
    v_area := p_area_type;
    if v_duration is null or v_duration < 15 or v_duration > 600
       or v_area is null or v_area not in ('party_room', 'entire_play_area') then return false; end if;
  end if;
  -- The venue is closed on Tuesdays, matching the existing membership/calendar rules.
  if extract(dow from (p_start_at at time zone 'Asia/Kolkata')) = 2 then return false; end if;
  v_end_at := p_start_at + make_interval(mins => v_duration);
  return not exists (
    select 1 from party_bookings b
    where b.status in ('pending', 'quoted', 'confirmed')
      and b.starts_at < v_end_at and b.ends_at > p_start_at
      and (
        b.area_type = 'entire_play_area'
        or v_area = 'entire_play_area'
        or b.area_type = v_area
      )
  );
end;
$$;

create or replace function check_party_booking_availability(
  p_plan_id uuid,
  p_start_at timestamptz,
  p_duration_minutes integer default null,
  p_area_type text default null
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select party_slot_is_available(p_plan_id, p_start_at, p_duration_minutes, p_area_type);
$$;

create or replace function register_party_booking(
  p_plan_id uuid,
  p_parent_name text,
  p_phone text,
  p_child_name text,
  p_start_at timestamptz,
  p_client_key text,
  p_custom_request boolean,
  p_request_message text,
  p_duration_minutes integer,
  p_area_type text,
  p_kids_count integer,
  p_adults_count integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan party_plans;
  v_booking_id uuid;
  v_end_at timestamptz;
  v_phone text;
  v_plan_name text;
  v_plan_price numeric;
  v_plan_area text;
  v_plan_duration integer;
  v_kids integer;
  v_adults integer;
  v_duplicate party_bookings;
begin
  if p_client_key is null or length(p_client_key) < 8 then
    raise exception 'Could not validate this request. Please refresh and try again.';
  end if;
  if not check_rate_limit('party-booking:' || p_client_key, 5, 300) then
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'P0001';
  end if;
  if nullif(trim(p_parent_name), '') is null or nullif(trim(p_child_name), '') is null then
    raise exception 'Parent and child names are required.';
  end if;
  if length(trim(p_parent_name)) > 120 or length(trim(p_child_name)) > 120 then
    raise exception 'Names must be 120 characters or fewer.';
  end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) < 10 or length(v_phone) > 15 then
    raise exception 'Enter a valid phone number.';
  end if;

  if coalesce(p_custom_request, false) then
    if nullif(trim(p_request_message), '') is null then
      raise exception 'Describe the party you have in mind.';
    end if;
    if length(trim(p_request_message)) > 2000 then
      raise exception 'Your party description must be 2,000 characters or fewer.';
    end if;
    if p_duration_minutes is null or p_duration_minutes < 15 or p_duration_minutes > 600
       or p_area_type is null or p_area_type not in ('party_room', 'entire_play_area') then
      raise exception 'Choose a valid requested time period and party area.';
    end if;
    v_plan_name := 'Custom party request';
    v_plan_price := null;
    v_plan_area := p_area_type;
    v_plan_duration := p_duration_minutes;
    if p_kids_count is null or p_adults_count is null
       or p_kids_count < 0 or p_adults_count < 0
       or p_kids_count > 100 or p_adults_count > 100 then
      raise exception 'Guest estimates must be between 0 and 100.';
    end if;
    v_kids := p_kids_count;
    v_adults := p_adults_count;
  else
    select * into v_plan from party_plans where id = p_plan_id and active = true;
    if v_plan.id is null then raise exception 'This party plan is no longer available.'; end if;
    v_plan_name := v_plan.name;
    v_plan_price := v_plan.price;
    v_plan_area := v_plan.area_type;
    v_plan_duration := v_plan.duration_minutes;
    v_kids := v_plan.kids_count;
    v_adults := v_plan.adults_count;
  end if;

  -- Serialize this low-volume booking operation to make the conflict check
  -- and insert atomic even when two visitors submit at the same time.
  perform pg_advisory_xact_lock(87654021);
  -- Treat a repeat submission for the same child, contact number and exact
  -- start time as the original request. This covers double taps, retries,
  -- and a page refresh after the insert succeeded but before its response.
  select * into v_duplicate
    from party_bookings b
   where b.phone = v_phone
     and lower(trim(b.child_name)) = lower(trim(p_child_name))
     and b.starts_at = p_start_at
     and b.status in ('pending', 'quoted', 'confirmed')
   order by b.created_at
   limit 1;
  if v_duplicate.id is not null then
    return json_build_object(
      'booking_id', v_duplicate.id,
      'status', v_duplicate.status,
      'plan_name', v_duplicate.plan_name,
      'starts_at', v_duplicate.starts_at,
      'ends_at', v_duplicate.ends_at,
      'duplicate', true
    );
  end if;

  if not party_slot_is_available(
    case when coalesce(p_custom_request, false) then null else p_plan_id end,
    p_start_at,
    v_plan_duration,
    v_plan_area
  ) then
    raise exception 'That date and time is unavailable. Please choose another slot.';
  end if;
  v_end_at := p_start_at + make_interval(mins => v_plan_duration);

  insert into party_bookings (
    party_plan_id, plan_name, plan_price, area_type, kids_count, adults_count,
    duration_minutes, parent_name, phone, child_name, custom_request,
    request_message, starts_at, ends_at
  ) values (
    case when coalesce(p_custom_request, false) then null else p_plan_id end,
    v_plan_name, v_plan_price, v_plan_area, v_kids, v_adults,
    v_plan_duration, trim(p_parent_name), v_phone,
    trim(p_child_name), coalesce(p_custom_request, false),
    case when coalesce(p_custom_request, false) then trim(p_request_message) else null end,
    p_start_at, v_end_at
  ) returning id into v_booking_id;

  return json_build_object(
    'booking_id', v_booking_id,
    'status', 'pending',
    'plan_name', v_plan_name,
    'starts_at', p_start_at,
    'ends_at', v_end_at
  );
end;
$$;

revoke all on function party_slot_is_available(uuid, timestamptz, integer, text) from public;
revoke all on function check_party_booking_availability(uuid, timestamptz, integer, text) from public;
revoke all on function register_party_booking(uuid, text, text, text, timestamptz, text, boolean, text, integer, text, integer, integer) from public;
grant execute on function check_party_booking_availability(uuid, timestamptz, integer, text) to anon, authenticated;
grant execute on function register_party_booking(uuid, text, text, text, timestamptz, text, boolean, text, integer, text, integer, integer) to anon, authenticated;
