-- =====================================================================
-- Migration 53: fix plan deletion, add "unregister" for special days
-- =====================================================================
-- A) membership_registrations.plan_id was set to ON DELETE SET NULL
--    back in migration 30 — reasonable then, but it now fights with the
--    membership_registrations_type_fields check constraint, which
--    requires plan_id to stay non-null for 'renewal' and 'special'
--    rows. Deleting a plan with any such registrations tried to null
--    them out, then failed the check constraint — a confusing error
--    that also would have silently stripped historical records of
--    which plan they were for. Correct fix: block the delete outright
--    when registrations reference the plan (default NO ACTION,
--    matching how child_subscriptions.plan_id and
--    child_special_passes.plan_id already behave), so history is
--    always preserved and a plan with zero registrants deletes cleanly.
-- B) admin_remove_special_pass — lets an admin take a specific child
--    off a special day's roster without deleting the plan itself.
--    Only removes the pass (their eligibility to check in that day);
--    their original registration record and any past visit history
--    stay untouched.
-- =====================================================================

alter table membership_registrations
  drop constraint if exists membership_registrations_plan_id_fkey;

alter table membership_registrations
  add constraint membership_registrations_plan_id_fkey
  foreign key (plan_id) references membership_plans(id);

create or replace function admin_remove_special_pass(p_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  delete from child_special_passes where id = p_pass_id;
end;
$$;

grant execute on function admin_remove_special_pass(uuid) to authenticated;