-- Venue-configurable availability window and party start-time step.
alter table app_settings
  add column if not exists party_booking_open_time time not null default '10:00',
  add column if not exists party_booking_close_time time not null default '20:00',
  add column if not exists party_booking_slot_minutes integer not null default 30
    check (party_booking_slot_minutes in (15, 30, 60));

alter table app_settings
  drop constraint if exists app_settings_party_booking_hours_check;
alter table app_settings
  add constraint app_settings_party_booking_hours_check
  check (party_booking_open_time < party_booking_close_time);

create or replace function party_slot_is_available(
  p_plan_id uuid,
  p_start_at timestamptz,
  p_duration_minutes integer default null,
  p_area_type text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_plan party_plans;
  v_end_at timestamptz;
  v_duration integer;
  v_area text;
  v_start_local timestamp;
  v_end_local timestamp;
  v_open time;
  v_close time;
  v_step integer;
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
  v_start_local := p_start_at at time zone 'Asia/Kolkata';
  -- The venue is closed on Tuesdays, matching existing check-in rules.
  if extract(dow from v_start_local) = 2 then return false; end if;
  select party_booking_open_time, party_booking_close_time, party_booking_slot_minutes
    into v_open, v_close, v_step from app_settings where id = true;
  v_end_at := p_start_at + make_interval(mins => v_duration);
  v_end_local := v_end_at at time zone 'Asia/Kolkata';
  if v_start_local::date <> v_end_local::date
     or v_start_local::time < v_open
     or v_end_local::time > v_close
     or mod(extract(epoch from (v_start_local::time - v_open))::integer, v_step) <> 0 then
    return false;
  end if;
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
