-- Migration 59: remove the legacy plan RPC overload and give every
-- recurring renewal its own registration/receipt number.

-- Migration 55 added a third argument with a default, but CREATE OR
-- REPLACE does not remove the old two-argument function. Calls with two
-- arguments therefore match both functions and fail as ambiguous.
drop function if exists apply_plan_to_child(uuid, uuid);

-- A renewal is a new registration event, even when it keeps the same
-- plan. The registration id is already generated per row; this also
-- gives each event a new human-facing receipt number.
create or replace function submit_membership_renewal(
  p_phone text,
  p_child_id uuid,
  p_plan_id uuid,
  p_client_key text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_id uuid;
  v_receipt text;
  v_plan membership_plans;
  v_reg_type text;
begin
  if not check_rate_limit('renewal:' || p_client_key, 5, 300) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  select c.customer_id into v_customer_id
  from children c
  join customers cu on cu.id = c.customer_id
  where c.id = p_child_id and cu.phone = p_phone;

  if v_customer_id is null then
    raise exception 'We could not match that child to this phone number.'
      using errcode = 'P0001';
  end if;

  select * into v_plan from membership_plans where id = p_plan_id and active = true;
  if v_plan.id is null then
    raise exception 'That plan is no longer available.' using errcode = 'P0001';
  end if;

  if v_plan.plan_type = 'special' then
    if exists (
      select 1 from child_special_passes
      where child_id = p_child_id and plan_id = p_plan_id
    ) or exists (
      select 1 from membership_registrations
      where renewal_child_id = p_child_id and plan_id = p_plan_id and status = 'pending'
    ) then
      raise exception 'This child is already registered for this special day.'
        using errcode = 'P0001';
    end if;

    v_reg_type := 'special';
    v_receipt := next_special_receipt(p_plan_id);
  else
    v_reg_type := 'renewal';
    v_receipt := next_receipt_number();
  end if;

  insert into membership_registrations (
    receipt_number, registration_type, renewal_customer_id, renewal_child_id,
    plan_id, plan_name_snapshot
  ) values (
    v_receipt, v_reg_type, v_customer_id, p_child_id, p_plan_id, v_plan.name
  )
  returning id, receipt_number into v_id, v_receipt;

  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;