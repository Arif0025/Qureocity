-- =====================================================================
-- Migration 41: special-day flow refinements
-- =====================================================================
-- Three things:
--   A) renewal_lookup gets an optional plan_id so the special-day page
--      can flag which of a family's kids are already booked for THIS
--      event (checkbox disabled, "Already registered"). Also fixes the
--      same plan_type-blind fallback bug migration 40 fixed elsewhere
--      — renewal_lookup's "current_plan_name" could show a special-day
--      plan's name instead of the child's actual membership.
--   B) submit_membership_renewal now rejects a duplicate special-day
--      booking server-side (defense in depth — the UI disables it too,
--      but this closes the gap for direct API calls/race conditions).
--   C) No schema change needed for excluding special plans from the
--      general registration/renewal pickers — that's a frontend-only
--      filter change — but documented here for completeness.
-- =====================================================================

create or replace function renewal_lookup(
  p_phone text,
  p_client_key text,
  p_plan_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer customers;
  v_children json;
begin
  if not check_rate_limit('renewal-lookup:' || p_client_key, 8, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  select * into v_customer from customers where phone = p_phone;

  if v_customer.id is null then
    return json_build_object('found', false);
  end if;

  select json_agg(json_build_object(
           'id', c.id,
           'name', c.name,
           'age', date_part('year', age(current_date, c.date_of_birth)),
           'current_plan_name', mp.name,
           'current_plan_expires_on', cs.expires_on,
           'current_plan_active', coalesce(
             cs.active and (cs.expires_on is null or cs.expires_on >= current_date),
             false
           ),
           'already_registered_for_plan',
             p_plan_id is not null and (
               exists (
                 select 1 from child_special_passes csp
                 where csp.child_id = c.id and csp.plan_id = p_plan_id
               )
               or exists (
                 select 1 from membership_registrations r
                 where r.renewal_child_id = c.id
                   and r.plan_id = p_plan_id
                   and r.status = 'pending'
               )
             )
         ) order by c.name)
  into v_children
  from children c
  left join child_subscriptions cs on cs.child_id = c.id
  left join membership_plans mp on mp.id = (
    select r2.plan_id from membership_registrations r2
    join membership_plans mp2 on mp2.id = r2.plan_id
    where r2.renewal_child_id = c.id and r2.status = 'confirmed'
      and mp2.plan_type = 'recurring'
    order by r2.reviewed_at desc nulls last, r2.submitted_at desc
    limit 1
  )
  where c.customer_id = v_customer.id;

  return json_build_object(
    'found', true,
    'customer_id', v_customer.id,
    'parent_name', v_customer.name,
    'children', coalesce(v_children, '[]'::json)
  );
end;
$$;

grant execute on function renewal_lookup(text, text, uuid) to anon, authenticated;

-- Existing-child submit now blocks a duplicate special-day booking.
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
  v_current_plan_id uuid;
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

    select plan_id into v_current_plan_id
    from child_subscriptions
    where child_id = p_child_id and active = true;

    if v_current_plan_id is not null and v_current_plan_id = p_plan_id then
      select receipt_number into v_receipt
      from membership_registrations
      where child_id = p_child_id or renewal_child_id = p_child_id
      order by submitted_at desc
      limit 1;
    end if;

    if v_receipt is null then
      v_receipt := next_receipt_number();
    end if;
  end if;

  insert into membership_registrations (
    receipt_number, registration_type, renewal_customer_id, renewal_child_id, plan_id
  ) values (
    v_receipt, v_reg_type, v_customer_id, p_child_id, p_plan_id
  )
  returning id, receipt_number into v_id, v_receipt;

  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;