-- =====================================================================
-- Migration 58: fix the public membership_plans read policy again
-- =====================================================================
-- Root cause: the public guest-facing plan list was still using a select
-- policy that called is_admin_member() from the membership_plans table.
-- That function is intentionally restricted to authenticated users, so anon
-- calls hit: permission denied for function is_admin_member.
--
-- We fix it by separating the policies:
--   * anyone can read active plans without invoking any admin helper
--   * authenticated admins can read the full plan table
--
-- This keeps the kiosk / customer registration flow working without exposing
-- non-public admin-only rows to anonymous visitors.
-- =====================================================================

drop policy if exists "anyone can read active plans" on membership_plans;
drop policy if exists "admins can read all plans" on membership_plans;

create policy "anyone can read active plans" on membership_plans
  for select to anon, authenticated
  using (active = true);

create policy "admins can read all plans" on membership_plans
  for select to authenticated
  using (is_admin_member());

-- Keep the admin mutation policies intact; the public select is now safe.
-- This makes the customer registration step able to list the active plans
-- again without triggering the admin permission check.
