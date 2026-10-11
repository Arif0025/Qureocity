-- =====================================================================
-- Migration 80: admin read for "currently overdue" children
-- =====================================================================
-- Backs the Team Today Notify popup's "remind about overtime" quick
-- option — it needs a short, always-small list of children whose
-- session has run past its end time right now, so the admin can name
-- one in the nudge without typing. This is a read-only twin of the
-- logic already in push_notify_sessions_overdue() (0076); that function
-- only logs/sends, it was never meant to be called from the client, and
-- it doesn't return names — this does.
-- =====================================================================

create or replace function admin_list_overdue_sessions()
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
    select coalesce(json_agg(json_build_object(
      'session_id', ps.id,
      'child_name', c.name,
      'minutes_overdue', ceil(extract(epoch from (now() - ps.end_time)) / 60)::int
    ) order by ps.end_time), '[]'::json)
    from play_sessions ps
    join children c on c.id = ps.child_id
    where ps.status = 'active'
      and ps.end_time is not null
      and ps.end_time < now()
  );
end;
$$;

revoke all on function admin_list_overdue_sessions() from public, anon;
grant execute on function admin_list_overdue_sessions() to authenticated;

notify pgrst, 'reload schema';