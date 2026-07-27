-- =====================================================================
-- Migration 8: grant table privileges to service_role
-- =====================================================================
-- Same issue as migration 5, different role: service_role bypasses RLS,
-- but Postgres still requires an underlying GRANT before it can touch a
-- table at all. Migration 5 only covered `authenticated` — this covers
-- `service_role`, which is what the Admin API / createEmployee actually
-- runs as.

grant usage on schema public to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- So this doesn't quietly recur every time a future migration adds a
-- new table/function — apply the same grant automatically going forward.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;