-- Fix public membership plan visibility for anonymous kiosk users.
-- The public policy was calling is_admin_member() in an anon SELECT policy,
-- but that function is only granted to authenticated users.
-- This caused: permission denied for function is_admin_member.

-- Keep the plan list public for anon users, but only call the admin helper
-- when the caller is actually authenticated.
drop policy if exists "anyone can read active plans" on membership_plans;

create policy "anyone can read active plans" on membership_plans
  for select to anon, authenticated
  using (
    active = true
    or (auth.uid() is not null and is_admin_member())
  );

-- Optional extra safety: admins can still read inactive rows in the same
-- authenticated-only admin path without anon callers invoking the function.
-- We intentionally do not grant the admin function to anon.
