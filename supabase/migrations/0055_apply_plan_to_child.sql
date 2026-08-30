-- =====================================================================
-- Migration 55: admin_apply_plan_to_child — safe entry point for the
-- admin's manual "Add or renew a membership" form
-- =====================================================================
-- apply_plan_to_child has always been internal-only — called from
-- inside confirm_membership_registration, never granted to
-- authenticated directly, and it has no admin check of its own (it
-- trusts whatever already-gated function called it). The admin
-- dashboard's manual add/renew form never actually used it — it wrote
-- straight to child_subscriptions with a raw duration number and no
-- plan_id at all, completely bypassing the plan system added since.
-- This wrapper is the correctly-gated way to call it directly.
-- =====================================================================

-- apply_plan_to_child now accepts an optional start date, so admin
-- backdating (the existing "Date purchased" field) works correctly —
-- previously this always used current_date regardless of what was
-- passed in, silently ignoring any backdate the admin picked.
create or replace function apply_plan_to_child(
  p_child_id uuid,
  p_plan_id uuid,
  p_started_on date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan membership_plans;
  v_expires_on date;
begin
  select * into v_plan from membership_plans where id = p_plan_id;
  if v_plan.id is null then
    return;
  end if;

  if v_plan.plan_type = 'special' then
    insert into child_special_passes (child_id, plan_id, event_date)
    values (p_child_id, p_plan_id, v_plan.event_date)
    on conflict (child_id, plan_id) do update set event_date = excluded.event_date;
  else
    v_expires_on := p_started_on + (
      case v_plan.validity_unit
        when 'weeks' then (v_plan.validity_value * 7 || ' days')::interval
        else (v_plan.validity_value || ' months')::interval
      end
    );
    insert into child_subscriptions (child_id, active, started_on, expires_on, duration_months, plan_id)
    values (
      p_child_id, true, p_started_on, v_expires_on,
      case when v_plan.validity_unit = 'months' then v_plan.validity_value else null end,
      p_plan_id
    )
    on conflict (child_id) do update set
      active = true,
      started_on = p_started_on,
      expires_on = v_expires_on,
      duration_months = excluded.duration_months,
      plan_id = excluded.plan_id,
      updated_at = now();
  end if;
end;
$$;

create or replace function admin_apply_plan_to_child(
  p_child_id uuid,
  p_plan_id uuid,
  p_started_on date default current_date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan membership_plans;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  select * into v_plan from membership_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plan not found.' using errcode = 'P0001';
  end if;
  if v_plan.plan_type <> 'recurring' then
    raise exception 'Use the plan roster to register a child for a special day.'
      using errcode = 'P0001';
  end if;

  perform apply_plan_to_child(p_child_id, p_plan_id, p_started_on);

  return json_build_object('success', true);
end;
$$;

grant execute on function admin_apply_plan_to_child(uuid, uuid, date) to authenticated;s