-- Admin-only push alerts for membership/special-day and party submissions.
alter table notification_rules
  drop constraint if exists notification_rules_event_type_check;
alter table notification_rules
  add constraint notification_rules_event_type_check check (event_type in (
    'child_checkin', 'child_checkout', 'session_ending', 'session_overdue',
    'staff_punch_in', 'staff_punch_out', 'new_registration', 'party_registration'
  ));

insert into notification_rules (event_type, employee_scope, params) values
  ('new_registration', 'none', '{}'),
  ('party_registration', 'none', '{}')
on conflict (event_type) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'party_bookings'
  ) then
    alter publication supabase_realtime add table party_bookings;
  end if;
end $$;

create or replace function trg_push_registration_submissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform push_enqueue('new_registration', jsonb_build_object('registration_id', new.id));
  end if;
  return null;
end;
$$;
drop trigger if exists trg_push_registration_submissions on membership_registrations;
create trigger trg_push_registration_submissions
  after insert on membership_registrations
  for each row execute function trg_push_registration_submissions();

create or replace function trg_push_party_submissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform push_enqueue('party_registration', jsonb_build_object('booking_id', new.id));
  end if;
  return null;
end;
$$;
drop trigger if exists trg_push_party_submissions on party_bookings;
create trigger trg_push_party_submissions
  after insert on party_bookings
  for each row execute function trg_push_party_submissions();

create or replace function push_event_context(p_event text, p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rule notification_rules;
  v_ctx jsonb := '{}'::jsonb;
begin
  select * into v_rule from notification_rules where event_type = p_event;
  if v_rule.event_type is null then return null; end if;

  if p_event in ('child_checkin', 'child_checkout', 'session_ending', 'session_overdue') then
    select jsonb_build_object(
      'session_id', ps.id, 'child_name', c.name, 'start_time', ps.start_time,
      'end_time', ps.end_time, 'ended_at', ps.ended_at, 'duration_mins', ps.duration_mins,
      'minutes_left', case when ps.end_time is null then null else greatest(0, ceil(extract(epoch from (ps.end_time - now())) / 60))::int end,
      'minutes_overdue', case when ps.end_time is null then null else greatest(0, floor(extract(epoch from (now() - ps.end_time)) / 60))::int end,
      'staff_on_site', (select coalesce(jsonb_agg(e.name order by e.name), '[]'::jsonb) from attendance_logs al join employees e on e.id = al.employee_id where al.punch_out is null)
    ) into v_ctx
    from play_sessions ps join children c on c.id = ps.child_id
    where ps.id = (p_payload->>'session_id')::uuid;
  elsif p_event in ('staff_punch_in', 'staff_punch_out') then
    select jsonb_build_object('employee_id', e.id, 'employee_name', e.name, 'punch_in', al.punch_in, 'punch_out', al.punch_out, 'auto', coalesce(al.auto_punched_out, false))
      into v_ctx from attendance_logs al join employees e on e.id = al.employee_id
     where al.id = (p_payload->>'log_id')::uuid;
  elsif p_event = 'new_registration' then
    select jsonb_build_object(
      'registration_id', r.id, 'registration_type', r.registration_type,
      'child_name', r.child_name, 'parent_name', r.parent_name,
      'plan_name', coalesce(p.name, 'No plan selected'),
      'receipt_number', r.receipt_number, 'event_date', coalesce(r.special_event_date, r.plan_event_date)
    ) into v_ctx
    from membership_registrations r left join membership_plans p on p.id = r.plan_id
    where r.id = (p_payload->>'registration_id')::uuid and r.status = 'pending';
  elsif p_event = 'party_registration' then
    select jsonb_build_object(
      'booking_id', b.id, 'child_name', b.child_name, 'parent_name', b.parent_name,
      'plan_name', b.plan_name, 'starts_at', b.starts_at
    ) into v_ctx from party_bookings b
    where b.id = (p_payload->>'booking_id')::uuid and b.status = 'pending';
  end if;

  if v_ctx is null or v_ctx = '{}'::jsonb then return null; end if;
  return v_ctx || jsonb_build_object('rule', jsonb_build_object(
    'show_child_name', v_rule.show_child_name,
    'employee_scope', v_rule.employee_scope,
    'params', v_rule.params
  ));
end;
$$;

revoke all on function trg_push_registration_submissions() from public, anon, authenticated;
revoke all on function trg_push_party_submissions() from public, anon, authenticated;
revoke all on function push_event_context(text, jsonb) from public, anon, authenticated;
grant execute on function push_event_context(text, jsonb) to service_role;

notify pgrst, 'reload schema';
