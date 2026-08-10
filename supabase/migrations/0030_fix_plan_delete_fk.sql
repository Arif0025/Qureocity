-- =====================================================================
-- Migration 30: plan delete fix
-- =====================================================================
-- membership_registrations.plan_id had no ON DELETE behavior, which
-- defaults to blocking the delete — so removing any plan that was ever
-- used in a registration (even a long-confirmed one) silently failed at
-- the DB level. SET NULL means old registration records just lose the
-- plan reference instead of permanently locking the plan row in place.
-- =====================================================================

alter table membership_registrations
  drop constraint if exists membership_registrations_plan_id_fkey;

alter table membership_registrations
  add constraint membership_registrations_plan_id_fkey
  foreign key (plan_id) references membership_plans(id) on delete set null;