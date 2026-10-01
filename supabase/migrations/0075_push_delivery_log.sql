-- =====================================================================
-- Migration 75: push notification observability
-- =====================================================================
-- Reported symptom: some people/devices get notifications, others don't,
-- inconsistently, even with matching settings on both ends. There was no
-- way to actually see what happened on a given send — this adds that.
--
--   * push_send_log       one row per (attempted) push to one device
--   * push_log_send()     called by /api/push/notify and the new
--                         broadcast-test route to record each attempt
--   * push_my_settings()  now also returns, for the calling device,
--                         when a push last actually reached it
--   * admin_recent_push_sends() admin-only feed of recent send attempts
--
-- A device is identified in the log by a short fingerprint of its push
-- endpoint (not the endpoint itself) so the log stays useful even after
-- push_prune_subscription() has deleted the subscription row — the log
-- is a historical record, the subscriptions table is current state.
-- =====================================================================

create table if not exists push_send_log (
  id                   bigserial primary key,
  event_type           text not null,
  is_test              boolean not null default false,
  user_id              uuid references employees(id) on delete set null,
  device_label         text,
  endpoint_fingerprint text not null,
  result               text not null check (result in ('sent', 'failed', 'gone')),
  created_at           timestamptz not null default now()
);
create index if not exists idx_push_send_log_user_time
  on push_send_log(user_id, created_at desc);
create index if not exists idx_push_send_log_time
  on push_send_log(created_at desc);
create index if not exists idx_push_send_log_fingerprint
  on push_send_log(endpoint_fingerprint, created_at desc);

alter table push_send_log enable row level security;
revoke all on push_send_log from anon, authenticated;

-- Same fingerprint scheme the API routes use (md5, first 16 hex chars) —
-- never the raw endpoint, so nothing extra sensitive sits in the log.
create or replace function push_endpoint_fingerprint(p_endpoint text)
returns text
language sql
immutable
as $$
  select left(md5(p_endpoint), 16);
$$;

-- push_resolve_recipients, extended with device_label so the notify
-- route can write a meaningful log entry (0072's version, body only —
-- same filtering logic, same signature except one added output column).
-- CREATE OR REPLACE can't change a function's output columns, so the
-- old version has to be dropped first.
drop function if exists push_resolve_recipients(text, uuid);

create or replace function push_resolve_recipients(
  p_event text,
  p_exclude_user uuid default null
)
returns table (
  user_id      uuid,
  role         text,
  endpoint     text,
  p256dh       text,
  auth_secret  text,
  device_label text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, e.role::text, s.endpoint, s.p256dh, s.auth_secret, s.device_label
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

revoke all on function push_resolve_recipients(text, uuid) from public, anon, authenticated;
grant execute on function push_resolve_recipients(text, uuid) to service_role;

-- Called by the server (service role) after every send attempt, real or
-- test. Not reachable by admins/employees directly — only the API routes
-- use this, with the service role.
create or replace function push_log_send(
  p_event_type   text,
  p_is_test      boolean,
  p_user_id      uuid,
  p_device_label text,
  p_endpoint     text,
  p_result       text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into push_send_log (
    event_type, is_test, user_id, device_label, endpoint_fingerprint, result
  ) values (
    p_event_type, p_is_test, p_user_id, p_device_label,
    push_endpoint_fingerprint(p_endpoint), p_result
  );
$$;

revoke all on function push_log_send(text, boolean, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function push_log_send(text, boolean, uuid, text, text, text)
  to service_role;

-- push_my_settings, extended with per-device delivery history. Same
-- signature as 0072 so no caller changes; body only.
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
  v_fp   text := case when p_endpoint is null then null
                       else push_endpoint_fingerprint(p_endpoint) end;
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
    'last_sent_at', case when v_fp is null then null else (
      select max(created_at) from push_send_log
      where user_id = v_uid and endpoint_fingerprint = v_fp and result = 'sent'
    ) end,
    'last_failed_at', case when v_fp is null then null else (
      select max(created_at) from push_send_log
      where user_id = v_uid and endpoint_fingerprint = v_fp and result in ('failed', 'gone')
    ) end,
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

-- Admin-only feed: what was sent recently, to whom, and whether it
-- actually went through — the "stop guessing, go look" view.
create or replace function admin_recent_push_sends(p_limit int default 50)
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

  return (
    select coalesce(json_agg(row_data), '[]'::json) from (
      select json_build_object(
        'event_type', l.event_type,
        'is_test', l.is_test,
        'person', coalesce(e.name, 'Removed person'),
        'device', coalesce(l.device_label, 'Unknown device'),
        'result', l.result,
        'created_at', l.created_at
      ) as row_data
      from push_send_log l
      left join employees e on e.id = l.user_id
      order by l.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) t
  );
end;
$$;

revoke all on function admin_recent_push_sends(int) from public, anon;
grant execute on function admin_recent_push_sends(int) to authenticated;

-- push_my_subscription, extended with device_label (0072's version,
-- body only — json return type, so no drop needed for this one).
create or replace function push_my_subscription(p_endpoint text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth_secret', s.auth_secret,
    'device_label', s.device_label
  )
  from push_subscriptions s
  where s.endpoint = p_endpoint and s.user_id = auth.uid();
$$;

-- Extend the existing housekeeping job so the log doesn't grow forever.
-- Re-registering under the same job name replaces its schedule/command.
do $$
begin
  perform cron.schedule(
    'push-housekeeping',
    '15 20 * * *',
    $job$
      delete from public.notification_log where created_at < now() - interval '14 days';
      delete from public.push_send_log where created_at < now() - interval '30 days';
      delete from cron.job_run_details where end_time < now() - interval '3 days';
    $job$
  );
exception when others then
  raise notice 'Could not update the push-housekeeping cron job (%). If pg_cron is enabled, re-run this block manually.', sqlerrm;
end $$;

notify pgrst, 'reload schema';