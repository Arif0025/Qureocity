-- Expose the actual checkout timestamp to the admin-only push message flow.
-- Keep the existing permission check and grants from migration 0103.
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
    'ended_at', ps.ended_at,
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
