-- Include the parent phone on server-side child event context so admin
-- checkout pushes can offer a one-tap WhatsApp action. The push builder
-- only emits that action for admin recipients; employee payloads omit it.
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
  if v_rule.event_type is null then
    return null;
  end if;

  if p_event in ('child_checkin', 'child_checkout', 'session_ending') then
    select jsonb_build_object(
      'session_id', ps.id,
      'child_name', c.name,
      'parent_name', cu.name,
      'customer_phone', cu.phone,
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
    join customers cu on cu.id = c.customer_id
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
    return null;
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

revoke all on function public.push_event_context(text, jsonb) from public, anon, authenticated;
grant execute on function public.push_event_context(text, jsonb) to service_role;
