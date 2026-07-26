-- =====================================================================
-- Migration 5: grant base table privileges
-- =====================================================================
-- RLS policies restrict which ROWS a role can see, but Postgres still
-- requires a separate GRANT before that role can touch the table at
-- all. Supabase's dashboard UI adds these automatically when you create
-- a table there; since these tables were created via raw SQL, none of
-- that happened — every policy above has been correct, but authenticated
-- had no underlying permission to query these tables, hence the 403s.

grant usage on schema public to authenticated, anon;

grant select on employees to authenticated;
grant select on customers to authenticated;
grant select on children to authenticated;
grant select, update on play_sessions to authenticated;
grant select, insert, update on attendance_logs to authenticated;

-- app_settings: read is meant to be public (the /desk display page isn't
-- authenticated), update is admin-only (already enforced by RLS)
grant select on app_settings to authenticated, anon;
grant update on app_settings to authenticated;
