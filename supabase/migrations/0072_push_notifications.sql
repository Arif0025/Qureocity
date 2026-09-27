-- =====================================================================
-- Migration 72: web push notifications (admins + employees)
-- =====================================================================
-- What this adds
--   * push_subscriptions      one row per device that opted in
--   * notification_rules      venue-wide settings per event type, edited
--                             by admins (on/off, thresholds, whether
--                             employees also receive it)
--   * notification_preferences each person's own opt-in per event type
--                             (no row = off; that is the default)
--   * notification_log        de-duplication for time-based alerts
--   * push_config             where the database sends events (URL +
--                             shared secret), never readable by clients
--
-- How an event travels
--   1. A trigger (or the every-minute pg_cron job for "time nearing
--      end") calls push_enqueue().
--   2. push_enqueue() POSTs {event, payload} to the Next.js route
--      /api/push/notify using pg_net (asynchronous, fire-and-forget).
--   3. The route asks push_event_context() what happened, asks
--      push_resolve_recipients() who should hear about it, then sends
--      Web Push messages.
--
-- Nothing in here can block or roll back a check-in or a punch:
-- push_enqueue() swallows every error, and it exits immediately when
-- nobody has subscribed or push_config has not been filled in.
--
-- One-time setup after running this file (see the bottom of the file).
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists push_config (
  id            boolean primary key default true,
  notify_url    text,
  notify_secret text,
  constraint push_config_single_row check (id = true)
);
insert into push_config (id) values (true) on conflict do nothing;

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references employees(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth_secret  text not null,
  user_agent   text,
  device_label text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);

create table if not exists notification_rules (
  event_type      text primary key
    check (event_type in (
      'child_checkin', 'child_checkout', 'session_ending',
      'staff_punch_in', 'staff_punch_out'
    )),
  enabled         boolean not null default true,
  -- Admins who opted in always receive an enabled event. This decides
  -- whether employees can receive it too: nobody / employees currently
  -- punched in / every employee.
  employee_scope  text not null default 'none'
    check (employee_scope in ('none', 'on_duty', 'all')),
  show_child_name boolean not null default false,
  params          jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references employees(id) on delete set null
);

insert into notification_rules (event_type, params) values
  ('child_checkin',   '{"include_staff_on_site": true}'),
  ('child_checkout',  '{}'),
  ('session_ending',  '{"minutes_before": 10}'),
  ('staff_punch_in',  '{}'),
  ('staff_punch_out', '{"include_auto": false}')
on conflict (event_type) do nothing;

create table if not exists notification_preferences (
  user_id    uuid not null references employees(id) on delete cascade,
  event_type text not null references notification_rules(event_type) on delete cascade,
  enabled    boolean not null default false,
  primary key (user_id, event_type)
);

create table if not exists notification_log (
  event_type text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  primary key (event_type, dedupe_key)
);

-- Locked down: no client role reads or writes these directly. Every
-- access goes through the SECURITY DEFINER functions below.
alter table push_config             enable row level security;
alter table push_subscriptions      enable row level security;
alter table notification_rules      enable row level security;
alter table notification_preferences enable row level security;
alter table notification_log        enable row level security;

revoke all on push_config, push_subscriptions, notification_rules,
  notification_preferences, notification_log from anon, authenticated;

-- ---------------------------------------------------------------------
-- Sending side (database -> Next.js route)
-- ---------------------------------------------------------------------
create or replace function push_enqueue(p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select notify_url, notify_secret into v_url, v_secret
  from push_config where id = true;
  if v_url is null or v_secret is null then
    return; -- push not configured yet
  end if;

  if not exists (
    select 1 from notification_rules where event_type = p_event and enabled
  ) then
    return;
  end if;

  if not exists (select 1 from push_subscriptions) then
    return; -- nobody has opted in, skip the HTTP call entirely
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('event', p_event, 'payload', p_payload)
  );
exception when others then
  -- A notification problem must never block a check-in or a punch.
  raise warning 'push_enqueue failed: %', sqlerrm;
end;
$$;

revoke all on function push_enqueue(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Triggers. Every one only fires for things happening *now* (within the
-- last two minutes), so backfilled walk-ins (0067), admin corrections
-- (0047, 0068) and force punches never notify anyone.
-- ---------------------------------------------------------------------
create or replace function trg_push_session_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'active'
       and new.start_time > now() - interval '2 minutes' then
      perform push_enqueue(
        'child_checkin', jsonb_build_object('session_id', new.id)
      );
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'active' and new.status = 'completed'
       and coalesce(new.ended_at, now()) > now() - interval '2 minutes' then
      perform push_enqueue(
        'child_checkout', jsonb_build_object('session_id', new.id)
      );
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_push_session_events on play_sessions;
create trigger trg_push_session_events
  after insert or update on play_sessions
  for each row execute function trg_push_session_events();

create or replace function trg_push_attendance_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_include_auto boolean;
begin
  if tg_op = 'INSERT' then
    if new.punch_out is null
       and new.punch_in > now() - interval '2 minutes' then
      perform push_enqueue(
        'staff_punch_in',
        jsonb_build_object('log_id', new.id, 'employee_id', new.employee_id)
      );
    end if;
  elsif tg_op = 'UPDATE' then
    if old.punch_out is null and new.punch_out is not null then
      if coalesce(new.auto_punched_out, false) then
        select coalesce((params->>'include_auto')::boolean, false)
          into v_include_auto
        from notification_rules where event_type = 'staff_punch_out';
        if coalesce(v_include_auto, false) then
          perform push_enqueue(
            'staff_punch_out',
            jsonb_build_object(
              'log_id', new.id, 'employee_id', new.employee_id, 'auto', true
            )
          );
        end if;
      elsif new.punch_out > now() - interval '2 minutes' then
        perform push_enqueue(
          'staff_punch_out',
          jsonb_build_object(
            'log_id', new.id, 'employee_id', new.employee_id, 'auto', false
          )
        );
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_push_attendance_events on attendance_logs;
create trigger trg_push_attendance_events
  after insert or update on attendance_logs
  for each row execute function trg_push_attendance_events();

revoke all on function trg_push_session_events() from public, anon, authenticated;
revoke all on function trg_push_attendance_events() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- "Time nearing end" — run every minute by pg_cron (scheduled below).
-- Reads the truth each time instead of storing promises about the
-- future, so extended sessions, early check-outs and changed thresholds
-- need no special handling. notification_log makes each session/end
-- time notify exactly once; an extended session re-arms automatically
-- because its end_time (part of the key) changes.
-- ---------------------------------------------------------------------
create or replace function push_notify_sessions_ending()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule    notification_rules;
  v_minutes int;
  v_row     record;
  v_count   int := 0;
begin
  select * into v_rule from notification_rules where event_type = 'session_ending';
  if v_rule.event_type is null or not v_rule.enabled then
    return 0;
  end if;
  if not exists (select 1 from push_subscriptions) then
    return 0;
  end if;

  v_minutes := greatest(1, coalesce((v_rule.params->>'minutes_before')::int, 10));

  for v_row in
    select ps.id, ps.end_time
    from play_sessions ps
    where ps.status = 'active'
      and ps.end_time is not null
      and ps.end_time > now()
      and ps.end_time <= now() + make_interval(mins => v_minutes)
  loop
    insert into notification_log (event_type, dedupe_key)
    values (
      'session_ending',
      v_row.id::text || ':' || extract(epoch from v_row.end_time)::bigint::text
    )
    on conflict do nothing;

    if found then
      perform push_enqueue(
        'session_ending', jsonb_build_object('session_id', v_row.id)
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function push_notify_sessions_ending() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Used by the Next.js route (service role only)
-- ---------------------------------------------------------------------
create or replace function push_resolve_recipients(
  p_event text,
  p_exclude_user uuid default null
)
returns table (
  user_id     uuid,
  role        text,
  endpoint    text,
  p256dh      text,
  auth_secret text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, e.role::text, s.endpoint, s.p256dh, s.auth_secret
  from notification_rules r
  join notification_preferences np
    on np.event_type = r.event_type and np.enabled
  join employees e on e.id = np.user_id
  join push_subscriptions s on s.user_id = e.id
  where r.event_type = p_event
    and r.enabled
    and (p_exclude_user is null or e.id <> p_exclude_user)
    and (
      e.role = 'admin'
      or r.employee_scope = 'all'
      or (
        r.employee_scope = 'on_duty'
        and exists (
          select 1 from attendance_logs al
          where al.employee_id = e.id and al.punch_out is null
        )
      )
    );
$$;

create or replace function push_event_context(p_event text, p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rule notification_rules;
  v_ctx  jsonb := '{}'::jsonb;
begin
  select * into v_rule from notification_rules where event_type = p_event;
  if v_rule.event_type is null then
    return null;
  end if;

  if p_event in ('child_checkin', 'child_checkout', 'session_ending') then
    select jsonb_build_object(
      'session_id', ps.id,
      'child_name', c.name,
      'start_time', ps.start_time,
      'end_time', ps.end_time,
      'ended_at', ps.ended_at,
      'duration_mins', ps.duration_mins,
      'minutes_left', case
        when ps.end_time is null then null
        else greatest(0, ceil(extract(epoch from (ps.end_time - now())) / 60))::int
      end,
      'staff_on_site', (
        select coalesce(jsonb_agg(e.name order by e.name), '[]'::jsonb)
        from attendance_logs al
        join employees e on e.id = al.employee_id
        where al.punch_out is null
      )
    ) into v_ctx
    from play_sessions ps
    join children c on c.id = ps.child_id
    where ps.id = (p_payload->>'session_id')::uuid;
  elsif p_event in ('staff_punch_in', 'staff_punch_out') then
    select jsonb_build_object(
      'employee_id', e.id,
      'employee_name', e.name,
      'punch_in', al.punch_in,
      'punch_out', al.punch_out,
      'auto', coalesce(al.auto_punched_out, false)
    ) into v_ctx
    from attendance_logs al
    join employees e on e.id = al.employee_id
    where al.id = (p_payload->>'log_id')::uuid;
  end if;

  if v_ctx is null or v_ctx = '{}'::jsonb then
    return null; -- the row is gone (deleted / discarded) — nothing to send
  end if;

  return v_ctx || jsonb_build_object(
    'rule', jsonb_build_object(
      'show_child_name', v_rule.show_child_name,
      'employee_scope', v_rule.employee_scope,
      'params', v_rule.params
    )
  );
end;
$$;

create or replace function push_prune_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function push_resolve_recipients(text, uuid) from public, anon, authenticated;
revoke all on function push_event_context(text, jsonb) from public, anon, authenticated;
revoke all on function push_prune_subscription(text) from public, anon, authenticated;
grant execute on function push_resolve_recipients(text, uuid) to service_role;
grant execute on function push_event_context(text, jsonb) to service_role;
grant execute on function push_prune_subscription(text) to service_role;

-- ---------------------------------------------------------------------
-- Personal device + preference RPCs (any signed-in employee or admin)
-- ---------------------------------------------------------------------
create or replace function push_save_subscription(
  p_endpoint     text,
  p_p256dh       text,
  p_auth_secret  text,
  p_user_agent   text default null,
  p_device_label text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from employees where id = v_uid) then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth_secret, '') = '' then
    raise exception 'Invalid push subscription.' using errcode = 'P0001';
  end if;

  insert into push_subscriptions (
    user_id, endpoint, p256dh, auth_secret, user_agent, device_label
  ) values (
    v_uid, p_endpoint, p_p256dh, p_auth_secret,
    left(p_user_agent, 300), left(p_device_label, 80)
  )
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    user_agent = excluded.user_agent,
    device_label = excluded.device_label,
    last_seen_at = now();

  return json_build_object('ok', true);
end;
$$;

create or replace function push_remove_subscription(p_endpoint text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  delete from push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
  return json_build_object('ok', true);
end;
$$;

-- Lets /api/push/test read back the caller's own subscription keys
-- without needing the service role.
create or replace function push_my_subscription(p_endpoint text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth_secret', s.auth_secret
  )
  from push_subscriptions s
  where s.endpoint = p_endpoint and s.user_id = auth.uid();
$$;

-- What the current person can switch on, what they have on, and how
-- many devices they have registered.
create or replace function push_my_settings(p_endpoint text default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  select role::text into v_role from employees where id = v_uid;
  if v_role is null then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  return json_build_object(
    'role', v_role,
    'device_count', (select count(*) from push_subscriptions where user_id = v_uid),
    'this_device_registered', exists (
      select 1 from push_subscriptions
      where user_id = v_uid and endpoint = p_endpoint
    ),
    'events', (
      select coalesce(json_agg(json_build_object(
        'event_type', r.event_type,
        'enabled', coalesce(np.enabled, false)
      ) order by r.event_type), '[]'::json)
      from notification_rules r
      left join notification_preferences np
        on np.event_type = r.event_type and np.user_id = v_uid
      where r.enabled
        and (v_role = 'admin' or r.employee_scope <> 'none')
    )
  );
end;
$$;

create or replace function push_set_preference(p_event text, p_enabled boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  select role::text into v_role from employees where id = v_uid;
  if v_role is null then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from notification_rules r
    where r.event_type = p_event
      and r.enabled
      and (v_role = 'admin' or r.employee_scope <> 'none')
  ) then
    raise exception 'That notification is not available for your account.'
      using errcode = 'P0001';
  end if;

  insert into notification_preferences (user_id, event_type, enabled)
  values (v_uid, p_event, coalesce(p_enabled, false))
  on conflict (user_id, event_type) do update set enabled = excluded.enabled;

  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Admin RPCs: venue-wide rules + who has devices registered
-- ---------------------------------------------------------------------
create or replace function admin_notification_overview()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  return json_build_object(
    'rules', (
      select coalesce(json_agg(json_build_object(
        'event_type', r.event_type,
        'enabled', r.enabled,
        'employee_scope', r.employee_scope,
        'show_child_name', r.show_child_name,
        'params', r.params
      ) order by r.event_type), '[]'::json)
      from notification_rules r
    ),
    'people', (
      select coalesce(json_agg(json_build_object(
        'id', e.id,
        'name', e.name,
        'role', e.role,
        'device_count', (
          select count(*) from push_subscriptions s where s.user_id = e.id
        ),
        'events', (
          select coalesce(json_agg(np.event_type order by np.event_type), '[]'::json)
          from notification_preferences np
          where np.user_id = e.id and np.enabled
        )
      ) order by e.role, e.name), '[]'::json)
      from employees e
    )
  );
end;
$$;

create or replace function admin_save_notification_rule(
  p_event           text,
  p_enabled         boolean,
  p_employee_scope  text,
  p_show_child_name boolean,
  p_params          jsonb default '{}'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_params jsonb := '{}'::jsonb;
  v_minutes int;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from notification_rules where event_type = p_event) then
    raise exception 'Unknown notification type.' using errcode = 'P0001';
  end if;
  if p_employee_scope not in ('none', 'on_duty', 'all') then
    raise exception 'Invalid recipient setting.' using errcode = 'P0001';
  end if;

  -- Only keep the parameters each event actually understands.
  if p_event = 'session_ending' then
    v_minutes := coalesce((p_params->>'minutes_before')::int, 10);
    if v_minutes < 1 or v_minutes > 120 then
      raise exception 'Minutes remaining must be between 1 and 120.'
        using errcode = 'P0001';
    end if;
    v_params := jsonb_build_object('minutes_before', v_minutes);
  elsif p_event = 'child_checkin' then
    v_params := jsonb_build_object(
      'include_staff_on_site',
      coalesce((p_params->>'include_staff_on_site')::boolean, true)
    );
  elsif p_event = 'staff_punch_out' then
    v_params := jsonb_build_object(
      'include_auto',
      coalesce((p_params->>'include_auto')::boolean, false)
    );
  end if;

  update notification_rules
  set enabled = coalesce(p_enabled, true),
      employee_scope = p_employee_scope,
      show_child_name = coalesce(p_show_child_name, false),
      params = v_params,
      updated_at = now(),
      updated_by = auth.uid()
  where event_type = p_event;

  return json_build_object('ok', true);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'push_save_subscription(text, text, text, text, text)',
    'push_remove_subscription(text)',
    'push_my_subscription(text)',
    'push_my_settings(text)',
    'push_set_preference(text, boolean)',
    'admin_notification_overview()',
    'admin_save_notification_rule(text, boolean, text, boolean, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Scheduling (pg_cron). Wrapped so a missing pg_cron never blocks the
-- rest of this migration — if you see the NOTICE, enable the extension
-- (Database -> Extensions) and run the two cron.schedule() calls again.
-- ---------------------------------------------------------------------
do $$
begin
  perform cron.schedule(
    'push-session-ending',
    '* * * * *',
    $job$select public.push_notify_sessions_ending()$job$
  );
  perform cron.schedule(
    'push-housekeeping',
    '15 20 * * *',
    $job$
      delete from public.notification_log where created_at < now() - interval '14 days';
      delete from cron.job_run_details where end_time < now() - interval '3 days';
    $job$
  );
exception when others then
  raise notice 'pg_cron jobs were not scheduled (%). Enable pg_cron, then schedule push_notify_sessions_ending() every minute.', sqlerrm;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
-- ONE-TIME SETUP (run after this migration, with your real values)
-- =====================================================================
--   update push_config
--   set notify_url    = 'https://<your-production-domain>/api/push/notify',
--       notify_secret = '<same value as PUSH_NOTIFY_SECRET in Vercel>'
--   where id = true;
--
-- Until push_config is filled in, every trigger exits immediately and
-- nothing is sent.
-- =====================================================================