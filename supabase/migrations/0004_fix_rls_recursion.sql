-- =====================================================================
-- Migration 4: fix infinite recursion in employees RLS
-- =====================================================================
-- Root cause: the employees SELECT policy checked admin status with
-- `exists (select 1 from employees ...)` — querying employees from
-- within employees' own policy. Postgres re-applies the policy to that
-- inner query too, forever, and throws "infinite recursion detected in
-- policy for relation employees" (surfaces to the client as a 500).
--
-- Every other table's "staff can read ___" policy also queries
-- employees internally to check staff status, so they were silently
-- exposed to the same failure the moment employees' own policy broke.
--
-- Fix: SECURITY DEFINER functions run with elevated privileges
-- internally, so the lookup inside them bypasses RLS instead of
-- re-triggering it — that's what actually breaks the loop.

create or replace function is_staff_member()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from employees where id = auth.uid());
$$;

create or replace function is_admin_member()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from employees where id = auth.uid() and role = 'admin');
$$;

revoke all on function is_staff_member() from public;
revoke all on function is_admin_member() from public;
grant execute on function is_staff_member() to authenticated;
grant execute on function is_admin_member() to authenticated;

-- employees
drop policy if exists "staff can read own employee row, admin reads all" on employees;
create policy "staff can read own employee row, admin reads all" on employees
  for select to authenticated using (
    id = auth.uid() or is_admin_member()
  );

-- customers
drop policy if exists "staff can read customers" on customers;
create policy "staff can read customers" on customers
  for select to authenticated using (is_staff_member());

-- children
drop policy if exists "staff can read children" on children;
create policy "staff can read children" on children
  for select to authenticated using (is_staff_member());

-- play_sessions
drop policy if exists "staff can read sessions" on play_sessions;
create policy "staff can read sessions" on play_sessions
  for select to authenticated using (is_staff_member());

drop policy if exists "staff can update sessions" on play_sessions;
create policy "staff can update sessions" on play_sessions
  for update to authenticated using (is_staff_member());

-- attendance_logs
drop policy if exists "admin/staff can read attendance" on attendance_logs;
create policy "admin/staff can read attendance" on attendance_logs
  for select to authenticated using (is_staff_member());

-- app_settings (migration 0003)
drop policy if exists "admin can update qr mode" on app_settings;
create policy "admin can update qr mode" on app_settings
  for update to authenticated using (is_admin_member());
