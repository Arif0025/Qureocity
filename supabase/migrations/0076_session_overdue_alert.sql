-- =====================================================================
-- Migration 76: "forgot to check out" reminder
-- =====================================================================
-- New event: session_overdue — a child's play session is still 'active'
-- past its end_time, meaning nobody has checked them out. Unlike
-- session_ending (fires once, 10 minutes before the end), this repeats
-- every N minutes (admin-set, default 15) for as long as it stays
-- unresolved, since a forgotten checkout is worth nagging about until
-- someone acts, not a one-time heads-up.
--
-- Deliberately no grace period here — expire_overdue_sessions() (0002)
-- waits 4 hours before auto-expiring a session, and only runs once a
-- day. This alert is intentionally immediate: the goal is for staff to
-- notice within minutes, independent of when that cleanup job next
-- runs. It doesn't touch expire_overdue_sessions() or its schedule.
--
-- Prerequisites: 0072 (push infrastructure), 0075 (device_label on
-- push_resolve_recipients / push_log_send).
-- =====================================================================

alter table notification_rules
  drop constraint if exists notification_rules_event_type_check;
alter table notification_rules
  add constraint notification_rules_event_type_check
  check (event_type in (
    'child_checkin', 'child_checkout', 'session_ending', 'session_overdue',
    'staff_punch_in', 'staff_punch_out'
  ));

insert into notification_rules (event_type, employee_scope, show_child_name, params)
values (
  'session_overdue',
  -- Whoever's on the floor is exactly who can act on this, so this one
  -- defaults to reaching on-duty staff too, not just admins.
  'on_duty',
  -- Staff need the name to know who to go check out.
  true,
  '{"repeat_minutes": 15}'
)
on conflict (event_type) do nothing;

-- push_event_context, extended with minutes_overdue (0072's version,
-- body only). Used by both session_ending and session_overdue — the
-- field is simply negative/zero for a session that isn't overdue yet.
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

  if p_event in ('child_checkin', 'child_checkout', 'session_ending', 'session_overdue') then
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
      'minutes_overdue', case
        when ps.end_time is null or ps.end_time >= now() then null
        else ceil(extract(epoch from (now() - ps.end_time)) / 60)::int
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

-- Runs every minute (scheduled below). Repeats every repeat_minutes for
-- as long as a session stays active-and-overdue — the dedupe key
-- includes a time bucket, so it fires once per bucket rather than once
-- ever, and stops on its own the moment the child is checked out (the
-- WHERE clause simply no longer matches that session).
create or replace function push_notify_sessions_overdue()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule    notification_rules;
  v_repeat  int;
  v_row     record;
  v_count   int := 0;
begin
  select * into v_rule from notification_rules where event_type = 'session_overdue';
  if v_rule.event_type is null or not v_rule.enabled then
    return 0;
  end if;
  if not exists (select 1 from push_subscriptions) then
    return 0;
  end if;

  v_repeat := greatest(1, coalesce((v_rule.params->>'repeat_minutes')::int, 15));

  for v_row in
    select ps.id,
      floor(extract(epoch from (now() - ps.end_time)) / 60 / v_repeat)::bigint as bucket
    from play_sessions ps
    where ps.status = 'active'
      and ps.end_time is not null
      and ps.end_time < now()
  loop
    insert into notification_log (event_type, dedupe_key)
    values ('session_overdue', v_row.id::text || ':' || v_row.bucket::text)
    on conflict do nothing;

    if found then
      perform push_enqueue(
        'session_overdue', jsonb_build_object('session_id', v_row.id)
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function push_notify_sessions_overdue() from public, anon, authenticated;

-- admin_save_notification_rule, extended to validate session_overdue's
-- repeat_minutes the same way session_ending's minutes_before is
-- validated (0072's version, body only — same signature).
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
  elsif p_event = 'session_overdue' then
    v_minutes := coalesce((p_params->>'repeat_minutes')::int, 15);
    if v_minutes < 1 or v_minutes > 120 then
      raise exception 'Reminder frequency must be between 1 and 120 minutes.'
        using errcode = 'P0001';
    end if;
    v_params := jsonb_build_object('repeat_minutes', v_minutes);
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

-- Extend the existing minute-level job rather than add a new one — same
-- job name as 0072, command replaced (the "session ending" name is now
-- slightly narrow, but renaming would orphan the old job entry).
do $$
begin
  perform cron.schedule(
    'push-session-ending',
    '* * * * *',
    $job$
      select public.push_notify_sessions_ending();
      select public.push_notify_sessions_overdue();
    $job$
  );
exception when others then
  raise notice 'Could not update the push-session-ending cron job (%). If pg_cron is enabled, re-run this block manually.', sqlerrm;
end $$;

notify pgrst, 'reload schema';