-- Minimal customer contact details for an admin opening a message action
-- from a child-session push. The session UUID alone is not an authorization.
create or replace function public.admin_session_message_context(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not is_admin_member() then
    raise exception 'Only admins can access customer message details.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'session_id', ps.id,
    'child_name', c.name,
    'parent_name', cu.name,
    'phone', cu.phone,
    'date_of_birth', c.date_of_birth,
    'start_time', ps.start_time,
    'end_time', ps.end_time,
    'status', ps.status
  ) into result
  from play_sessions ps
  join children c on c.id = ps.child_id
  join customers cu on cu.id = c.customer_id
  where ps.id = p_session_id;

  return result;
end;
$$;

revoke all on function public.admin_session_message_context(uuid) from public, anon;
grant execute on function public.admin_session_message_context(uuid) to authenticated;

-- Party requests can contain a child's name and family phone without a
-- child_id. Resolve DOB only when an authorized staff user actually opens
-- a message format that needs birthday information.
create or replace function public.staff_child_dob_for_contact(p_phone text, p_child_name text)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result date;
  normalized_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if not is_staff_member() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if normalized_phone = '' or trim(coalesce(p_child_name, '')) = '' then
    return null;
  end if;
  select ch.date_of_birth into result
  from children ch
  join customers cu on cu.id = ch.customer_id
  where lower(trim(ch.name)) = lower(trim(p_child_name))
    and (
      regexp_replace(coalesce(cu.phone, ''), '[^0-9]', '', 'g') = normalized_phone
      or regexp_replace(coalesce(cu.secondary_phone, ''), '[^0-9]', '', 'g') = normalized_phone
    )
  order by ch.created_at desc
  limit 1;
  return result;
end;
$$;
revoke all on function public.staff_child_dob_for_contact(text, text) from public, anon;
grant execute on function public.staff_child_dob_for_contact(text, text) to authenticated;

-- Keep the server push context complete for overdue alerts too. This also
-- supplies DOB for internal template personalization without placing PII in
-- the push payload or action URL.
create or replace function public.push_event_context(p_event text, p_payload jsonb)
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
      'session_id', ps.id,
      'child_name', c.name,
      'parent_name', cu.name,
      'customer_phone', cu.phone,
      'date_of_birth', c.date_of_birth,
      'start_time', ps.start_time,
      'end_time', ps.end_time,
      'ended_at', ps.ended_at,
      'duration_mins', ps.duration_mins,
      'minutes_left', case when ps.end_time is null then null
        else greatest(0, ceil(extract(epoch from (ps.end_time - now())) / 60))::int end,
      'minutes_overdue', case when ps.end_time is null then null
        else greatest(0, floor(extract(epoch from (now() - ps.end_time)) / 60))::int end,
      'staff_on_site', (
        select coalesce(jsonb_agg(e.name order by e.name), '[]'::jsonb)
        from attendance_logs al join employees e on e.id = al.employee_id
        where al.punch_out is null
      )
    ) into v_ctx
    from play_sessions ps
    join children c on c.id = ps.child_id
    join customers cu on cu.id = c.customer_id
    where ps.id = (p_payload->>'session_id')::uuid;
  elsif p_event in ('staff_punch_in', 'staff_punch_out') then
    select jsonb_build_object(
      'employee_id', e.id, 'employee_name', e.name,
      'punch_in', al.punch_in, 'punch_out', al.punch_out,
      'auto', coalesce(al.auto_punched_out, false)
    ) into v_ctx
    from attendance_logs al join employees e on e.id = al.employee_id
    where al.id = (p_payload->>'log_id')::uuid;
  end if;

  if v_ctx is null or v_ctx = '{}'::jsonb then return null; end if;
  return v_ctx || jsonb_build_object('rule', jsonb_build_object(
    'show_child_name', v_rule.show_child_name,
    'employee_scope', v_rule.employee_scope,
    'params', v_rule.params
  ));
end;
$$;

revoke all on function public.push_event_context(text, jsonb) from public, anon, authenticated;
grant execute on function public.push_event_context(text, jsonb) to service_role;
