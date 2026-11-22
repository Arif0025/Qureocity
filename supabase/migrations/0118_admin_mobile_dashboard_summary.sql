-- Small, admin-only aggregate for the mobile landing screen. The dashboard
-- receives counts only; personally identifying rows are fetched after a tap.
create index if not exists attendance_logs_open_punch_in_idx
  on public.attendance_logs (punch_in desc)
  where punch_out is null;

create or replace function public.admin_mobile_dashboard_summary(p_day date default (now() at time zone 'Asia/Kolkata')::date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_admin_member() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_day is null or p_day < v_today - 366 or p_day > v_today + 1 then
    raise exception 'Invalid dashboard date.' using errcode = '22023';
  end if;

  v_start := p_day::timestamp at time zone 'Asia/Kolkata';
  v_end := (p_day + 1)::timestamp at time zone 'Asia/Kolkata';

  return jsonb_build_object(
    'day', p_day,
    'pending_registrations', (select count(*) from public.membership_registrations where status = 'pending'),
    'pending_sessions', (select count(*) from public.play_sessions where status = 'pending_payment'),
    'pending_parties', (select count(*) from public.party_bookings where status = 'pending'),
    'pending_leave', (select count(*) from public.employee_leave_requests where status = 'pending'),
    'staff_on_site', (
      select count(distinct al.employee_id) from public.attendance_logs al
      join public.employees e on e.id = al.employee_id
      where al.punch_out is null and e.role <> 'admin'
    ),
    'kids_on_site', (select count(distinct child_id) from public.play_sessions where status = 'active'),
    'checkins_today', (
      select count(*) from public.play_sessions
      where start_time >= v_start and start_time < v_end
        and status in ('active', 'completed', 'expired')
    )
  );
end;
$$;

revoke all on function public.admin_mobile_dashboard_summary(date) from public, anon;
grant execute on function public.admin_mobile_dashboard_summary(date) to authenticated;

-- These older SECURITY DEFINER feeds expose customer or child details. Keep
-- their existing consumers working while enforcing the role check at source.
create or replace function public.dashboard_list_checked_in_kids()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (is_admin_member() or is_staff_member()) then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  return (
    select coalesce(json_agg(row_data order by (row_data->>'start_time')), '[]'::json)
    from (
      select json_build_object(
        'session_id', ps.id, 'child_id', ch.id, 'child_name', ch.name,
        'age', date_part('year', age(current_date, ch.date_of_birth)),
        'start_time', ps.start_time, 'end_time', ps.end_time, 'status', ps.status,
        'parent_name', c.name, 'phone', c.phone,
        'has_medical_info', nullif(trim(ch.allergies), '') is not null
          or nullif(trim(ch.medical_conditions), '') is not null
          or nullif(trim(ch.special_instructions), '') is not null,
        'visit_type', case
          when ps.special_pass_id is not null then 'special'
          when cs.started_on <= (ps.start_time at time zone 'Asia/Kolkata')::date
            and (cs.expires_on is null or cs.expires_on >= (ps.start_time at time zone 'Asia/Kolkata')::date)
            then 'membership' else 'walk_in' end,
        'plan_name', case when ps.special_pass_id is not null then smp.name else mp.name end
      ) as row_data
      from public.play_sessions ps
      join public.children ch on ch.id = ps.child_id
      join public.customers c on c.id = ch.customer_id
      left join lateral (
        select child_subscriptions.started_on, child_subscriptions.expires_on, child_subscriptions.plan_id
        from public.child_subscriptions
        where child_subscriptions.child_id = ch.id
        order by child_subscriptions.started_on desc
        limit 1
      ) cs on true
      left join public.membership_plans mp on mp.id = cs.plan_id
      left join public.child_special_passes csp on csp.id = ps.special_pass_id
      left join public.membership_plans smp on smp.id = csp.plan_id
      where ps.status = 'active'
    ) active_sessions
  );
end;
$$;
revoke all on function public.dashboard_list_checked_in_kids() from public, anon;
grant execute on function public.dashboard_list_checked_in_kids() to authenticated;

create or replace function public.list_pending_sessions()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (is_admin_member() or is_staff_member()) then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  return (
    select coalesce(json_agg(json_build_object(
      'session_id', ps.id, 'child_id', ps.child_id, 'child_name', c.name,
      'parent_name', cu.name, 'parent_phone', cu.phone,
      'start_time', ps.start_time, 'duration_mins', ps.duration_mins
    ) order by ps.start_time), '[]'::json)
    from public.play_sessions ps
    join public.children c on c.id = ps.child_id
    join public.customers cu on cu.id = c.customer_id
    where ps.status = 'pending_payment'
  );
end;
$$;
revoke all on function public.list_pending_sessions() from public, anon;
grant execute on function public.list_pending_sessions() to authenticated;

notify pgrst, 'reload schema';

-- Expo device tokens are separate from browser Web Push subscriptions. Only
-- the signed-in employee can register/remove their own token; service-role
-- event delivery resolves recipients through the function below.
create table if not exists public.mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.employees(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  device_label text not null default 'Mobile app',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists mobile_push_devices_user_idx
  on public.mobile_push_devices(user_id);
alter table public.mobile_push_devices enable row level security;
revoke all on public.mobile_push_devices from public, anon, authenticated;

-- Keep event-based pg_net delivery alive for native-only devices; the
-- historical function skipped the HTTP call when no browser subscription
-- existed. No schedule is involved in this trigger path.
create or replace function public.push_enqueue(p_event text, p_payload jsonb)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_url text; v_secret text;
begin
  select notify_url, notify_secret into v_url, v_secret
  from public.push_config where id = true;
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from public.notification_rules where event_type = p_event and enabled) then return; end if;
  if not exists (select 1 from public.push_subscriptions)
     and not exists (select 1 from public.mobile_push_devices) then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := jsonb_build_object('event', p_event, 'payload', p_payload)
  );
exception when others then
  raise warning 'push_enqueue failed: %', sqlerrm;
end;
$$;
revoke all on function public.push_enqueue(text, jsonb) from public, anon, authenticated;
grant execute on function public.push_enqueue(text, jsonb) to service_role;

-- Keep event delivery logs bounded without a scheduled cleanup task.
create or replace function public.push_log_send(
  p_event_type text, p_is_test boolean, p_user_id uuid,
  p_device_label text, p_endpoint text, p_result text
) returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.push_send_log(event_type, is_test, user_id, device_label, endpoint_fingerprint, result)
  values (p_event_type, p_is_test, p_user_id, p_device_label,
    public.push_endpoint_fingerprint(p_endpoint), p_result);
  delete from public.push_send_log where created_at < now() - interval '30 days';
end;
$$;
revoke all on function public.push_log_send(text, boolean, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.push_log_send(text, boolean, uuid, text, text, text) to service_role;

-- Session-window dedupe rows no longer have a scheduled producer.
delete from public.notification_log where created_at < now() - interval '14 days';

create or replace function public.mobile_push_register_device(
  p_token text, p_platform text, p_device_label text default 'Mobile app'
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.employees where id = v_uid) then
    raise exception 'Staff sign-in required.' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) > 255
     or p_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$'
     or p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'Invalid mobile push registration.' using errcode = '22023';
  end if;
  insert into public.mobile_push_devices(user_id, expo_push_token, platform, device_label)
  values (v_uid, p_token, p_platform, left(coalesce(nullif(trim(p_device_label), ''), 'Mobile app'), 80))
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id, platform = excluded.platform,
        device_label = excluded.device_label, last_seen_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mobile_push_unregister_device(p_token text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Sign-in required.' using errcode = '42501'; end if;
  delete from public.mobile_push_devices
  where user_id = auth.uid() and expo_push_token = p_token;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mobile_push_my_settings(p_token text default null)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  select role::text into v_role from public.employees where id = v_uid;
  if v_uid is null or v_role is null then raise exception 'Staff sign-in required.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'role', v_role,
    'device_registered', exists (select 1 from public.mobile_push_devices where user_id = v_uid and expo_push_token = p_token),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('event_type', r.event_type, 'enabled', coalesce(np.enabled, false)) order by r.event_type)
      from public.notification_rules r
      left join public.notification_preferences np on np.user_id = v_uid and np.event_type = r.event_type
      where r.enabled and r.event_type not in ('session_ending', 'session_overdue')
        and (v_role = 'admin' or r.employee_scope <> 'none')
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.mobile_push_resolve_recipients(
  p_event text, p_exclude_user uuid default null, p_target_user uuid default null
) returns table(user_id uuid, role text, expo_push_token text, device_label text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.id, e.role::text, d.expo_push_token, d.device_label
  from public.notification_rules r
  join public.notification_preferences np on np.event_type = r.event_type and np.enabled
  join public.employees e on e.id = np.user_id
  join public.mobile_push_devices d on d.user_id = e.id
  where r.event_type = p_event and r.enabled
    and r.event_type not in ('session_ending', 'session_overdue')
    and (p_exclude_user is null or e.id <> p_exclude_user)
    and (p_target_user is null or e.id = p_target_user)
    and (e.role = 'admin' or
      (p_event = 'employee_leave' and p_target_user is not null and e.id = p_target_user) or
      r.employee_scope = 'all' or
      (r.employee_scope = 'on_duty' and exists (
        select 1 from public.attendance_logs al where al.employee_id = e.id and al.punch_out is null
      )))
$$;

revoke all on function public.mobile_push_register_device(text, text, text) from public, anon;
grant execute on function public.mobile_push_register_device(text, text, text) to authenticated;
revoke all on function public.mobile_push_unregister_device(text) from public, anon;
grant execute on function public.mobile_push_unregister_device(text) to authenticated;
revoke all on function public.mobile_push_my_settings(text) from public, anon;
grant execute on function public.mobile_push_my_settings(text) to authenticated;
revoke all on function public.mobile_push_resolve_recipients(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mobile_push_resolve_recipients(text, uuid, uuid) to service_role;

-- The mobile app uses native push for immediate business events. Remove the
-- old session countdown/overdue and retention schedules from this deployment;
-- no notification schedule is recreated for mobile.
do $$
declare v_job record;
begin
  if to_regclass('cron.job') is not null then
    for v_job in execute
      'select jobid from cron.job where jobname = any($1)'
      using array['push-session-ending', 'push-session-ending-late-window', 'push-housekeeping', 'employee-inbox-retention']
    loop
      execute 'select cron.unschedule($1)' using v_job.jobid;
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- Called only by the authenticated mobile admin Edge Function after it
-- verifies the caller and derives the same scrypt hash used by the website.
-- Keep changing the password and revoking existing kiosks in one transaction.
create or replace function public.mobile_set_kiosk_password_hash(p_password_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_password_hash is null or p_password_hash !~ '^[a-f0-9]{32}:[a-f0-9]{128}$' then
    raise exception 'Invalid kiosk password hash.' using errcode = '22023';
  end if;
  update public.app_settings
  set kiosk_password_hash = p_password_hash
  where id = true;
  if not found then
    raise exception 'App settings row is missing.' using errcode = 'P0001';
  end if;
  update public.kiosk_sessions
  set revoked_at = now()
  where revoked_at is null;
end;
$$;

revoke all on function public.mobile_set_kiosk_password_hash(text) from public, anon, authenticated;
grant execute on function public.mobile_set_kiosk_password_hash(text) to service_role;

notify pgrst, 'reload schema';

-- Mobile admin family edits need one atomic, admin-only operation for the
-- customer's contact numbers and the selected child's profile. Preserve
-- recorded consent; editing contact details must not grant consent.
create or replace function public.admin_update_customer_record_mobile(
  p_customer_id uuid,
  p_child_id uuid,
  p_parent_name text,
  p_phone text,
  p_secondary_phone text,
  p_child_name text,
  p_date_of_birth date,
  p_address text,
  p_allergies text,
  p_medical_conditions text,
  p_special_instructions text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_name text := trim(coalesce(p_parent_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_secondary_phone text := nullif(regexp_replace(coalesce(p_secondary_phone, ''), '[^0-9]', '', 'g'), '');
  v_child_name text := trim(coalesce(p_child_name, ''));
begin
  if not public.is_admin_member() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_customer_id is null or p_child_id is null then
    raise exception 'Customer and child are required.' using errcode = '22023';
  end if;
  if v_parent_name = '' or length(v_parent_name) > 120 then
    raise exception 'Enter a valid parent or guardian name.' using errcode = '22023';
  end if;
  if length(v_phone) < 10 or length(v_phone) > 15 then
    raise exception 'Enter a phone number with 10 to 15 digits.' using errcode = '22023';
  end if;
  if v_secondary_phone is not null and length(v_secondary_phone) not between 10 and 15 then
    raise exception 'Secondary phone must have 10 to 15 digits.' using errcode = '22023';
  end if;
  if v_child_name = '' or length(v_child_name) > 120 then
    raise exception 'Enter a valid child name.' using errcode = '22023';
  end if;
  if p_date_of_birth is null or p_date_of_birth > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'A valid date of birth is required.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.children
    where id = p_child_id and customer_id = p_customer_id
  ) then
    raise exception 'Child was not found for this customer.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.customers
    where phone = v_phone and id <> p_customer_id
  ) then
    raise exception 'That phone number belongs to another customer.' using errcode = '23505';
  end if;

  update public.customers
  set name = v_parent_name,
      phone = v_phone,
      secondary_phone = v_secondary_phone,
      address = nullif(trim(coalesce(p_address, '')), '')
  where id = p_customer_id;

  update public.children
  set name = v_child_name,
      date_of_birth = p_date_of_birth,
      allergies = nullif(trim(coalesce(p_allergies, '')), ''),
      medical_conditions = nullif(trim(coalesce(p_medical_conditions, '')), ''),
      special_instructions = nullif(trim(coalesce(p_special_instructions, '')), '')
  where id = p_child_id and customer_id = p_customer_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.admin_update_customer_record_mobile(uuid, uuid, text, text, text, text, date, text, text, text, text) from public, anon;
grant execute on function public.admin_update_customer_record_mobile(uuid, uuid, text, text, text, text, date, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
