-- =====================================================================
-- Migration 40: special-day bookings are not membership renewals
-- =====================================================================
-- The bug: submit_membership_renewal fires any time an existing
-- customer is found by phone, regardless of which plan they picked. So
-- an existing member booking a one-off special day got tagged
-- registration_type = 'renewal' — same label as someone actually
-- extending their monthly membership. That bled into two places:
--   1. The admin pending queue showed "Renewal" for what was really a
--      special-day booking.
--   2. admin_list_child_subscriptions' legacy fallback (for rows
--      without their own plan_id) picked the most recently CONFIRMED
--      registration of any type — so a special-day booking newer than
--      someone's actual membership could overwrite what the Membership
--      tab displayed as their current plan/receipt.
--
-- Fix: registration_type gets a third value, 'special', which is
-- purely about the PLAN chosen, independent of whether the person was
-- already a customer or brand new. 'renewal' now only ever means "same
-- person, extending a recurring membership."
-- =====================================================================

-- ---------------------------------------------------------------------
-- Part A: widen registration_type and the field-shape constraint to
-- cover 'special', which can arrive via either the new-customer fields
-- or the existing-customer (renewal_*) fields, same as before — the
-- difference is purely the label, not which columns get populated.
-- ---------------------------------------------------------------------
alter table membership_registrations
  drop constraint if exists membership_registrations_registration_type_check;
alter table membership_registrations
  add constraint membership_registrations_registration_type_check
  check (registration_type in ('new', 'renewal', 'special'));

alter table membership_registrations
  drop constraint if exists membership_registrations_type_fields;
alter table membership_registrations
  add constraint membership_registrations_type_fields check (
    (registration_type = 'new'
       and child_name is not null and date_of_birth is not null
       and parent_name is not null and phone is not null)
    or
    (registration_type = 'renewal'
       and renewal_customer_id is not null and renewal_child_id is not null
       and plan_id is not null)
    or
    (registration_type = 'special'
       and plan_id is not null
       and (
         (renewal_customer_id is not null and renewal_child_id is not null)
         or
         (child_name is not null and date_of_birth is not null
            and parent_name is not null and phone is not null)
       ))
  );

-- ---------------------------------------------------------------------
-- Part B: new-customer submit — tag 'special' when the chosen plan is
-- a special day, 'new' otherwise. (Receipt scheme already branched on
-- plan_type since migration 39; unchanged here.)
-- ---------------------------------------------------------------------
create or replace function submit_membership_registration(
  p_child_name text,
  p_date_of_birth date,
  p_gender text,
  p_school text,
  p_interests text[],
  p_allergies text,
  p_medical_conditions text,
  p_special_instructions text,
  p_parent_name text,
  p_phone text,
  p_secondary_phone text,
  p_address text,
  p_plan_id uuid,
  p_how_heard text,
  p_photo_consent boolean,
  p_whatsapp_consent boolean,
  p_client_key text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_receipt text;
  v_plan_type text;
  v_reg_type text;
begin
  if not check_rate_limit('register:' || p_client_key, 5, 300) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  if p_child_name is null or trim(p_child_name) = '' then
    raise exception 'Child name is required.';
  end if;
  if p_parent_name is null or trim(p_parent_name) = '' then
    raise exception 'Parent/guardian name is required.';
  end if;
  if p_phone is null or trim(p_phone) = '' then
    raise exception 'Phone number is required.';
  end if;

  if p_plan_id is not null then
    select plan_type into v_plan_type from membership_plans where id = p_plan_id;
  end if;

  v_reg_type := case when v_plan_type = 'special' then 'special' else 'new' end;
  v_receipt := case
    when v_plan_type = 'special' then next_special_receipt(p_plan_id)
    else next_receipt_number()
  end;

  insert into membership_registrations (
    receipt_number, registration_type, child_name, date_of_birth, gender, school,
    interests, allergies, medical_conditions, special_instructions, parent_name,
    phone, secondary_phone, address, plan_id, how_heard, photo_consent,
    whatsapp_consent
  ) values (
    v_receipt, v_reg_type, trim(p_child_name), p_date_of_birth, p_gender, p_school,
    coalesce(p_interests, '{}'), p_allergies, p_medical_conditions,
    p_special_instructions, trim(p_parent_name), trim(p_phone),
    p_secondary_phone, p_address, p_plan_id, p_how_heard,
    coalesce(p_photo_consent, false), coalesce(p_whatsapp_consent, false)
  )
  returning id, receipt_number into v_id, v_receipt;

  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;

-- ---------------------------------------------------------------------
-- Part C: existing-customer submit — this is the one that was always
-- tagged 'renewal' no matter what. Now: special plan → 'special',
-- recurring plan → 'renewal' (with the existing same-plan receipt-reuse
-- behavior untouched).
-- ---------------------------------------------------------------------
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
    v_reg_type := 'special';
    v_receipt := next_special_receipt(p_plan_id);
  else
    v_reg_type := 'renewal';

    select plan_id into v_current_plan_id
    from child_subscriptions
    where child_id = p_child_id and active = true;

    if v_current_plan_id is not null and v_current_plan_id = p_plan_id then
      -- Same plan, just extending — reuse the most recent receipt this
      -- child has rather than minting a new membership id.
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

-- ---------------------------------------------------------------------
-- Part D: confirm — branches on WHICH FIELDS are populated (existing
-- customer vs new customer), not on registration_type, since 'special'
-- can arrive via either shape. This also means special-day bookings by
-- an existing member correctly link to their existing customer/child
-- record instead of creating a duplicate.
-- ---------------------------------------------------------------------
create or replace function confirm_membership_registration(p_registration_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg membership_registrations;
  v_customer_id uuid;
  v_child_id uuid;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  select * into v_reg from membership_registrations
    where id = p_registration_id and status = 'pending';

  if v_reg.id is null then
    return json_build_object('success', false, 'reason', 'already_handled');
  end if;

  if v_reg.renewal_customer_id is not null then
    -- Existing customer, either a true renewal or an existing member
    -- booking a special day.
    v_customer_id := v_reg.renewal_customer_id;
    v_child_id := v_reg.renewal_child_id;
    perform apply_plan_to_child(v_child_id, v_reg.plan_id);
  else
    -- New customer, either a first-time registration or a new family's
    -- special-day sign-up.
    select id into v_customer_id from customers where phone = v_reg.phone;

    if v_customer_id is null then
      insert into customers (name, phone, secondary_phone, address, how_heard, photo_consent, whatsapp_consent)
      values (v_reg.parent_name, v_reg.phone, v_reg.secondary_phone, v_reg.address, v_reg.how_heard, v_reg.photo_consent, v_reg.whatsapp_consent)
      returning id into v_customer_id;
    else
      update customers set
        secondary_phone = coalesce(v_reg.secondary_phone, secondary_phone),
        address = coalesce(v_reg.address, address),
        how_heard = coalesce(how_heard, v_reg.how_heard),
        photo_consent = photo_consent or v_reg.photo_consent,
        whatsapp_consent = whatsapp_consent or v_reg.whatsapp_consent
      where id = v_customer_id;
    end if;

    insert into children (
      customer_id, name, date_of_birth, gender, school, interests,
      allergies, medical_conditions, special_instructions
    ) values (
      v_customer_id, v_reg.child_name, v_reg.date_of_birth, v_reg.gender,
      v_reg.school, v_reg.interests, v_reg.allergies, v_reg.medical_conditions,
      v_reg.special_instructions
    )
    returning id into v_child_id;

    if v_reg.plan_id is not null then
      perform apply_plan_to_child(v_child_id, v_reg.plan_id);
    end if;
  end if;

  update membership_registrations
  set status = 'confirmed',
      customer_id = v_customer_id,
      child_id = v_child_id,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_registration_id;

  return json_build_object(
    'success', true,
    'customer_id', v_customer_id,
    'child_id', v_child_id
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Part E: the actual "wrong plan shows in the Membership tab" bug —
-- both fallback subqueries (only used for legacy rows that predate
-- child_subscriptions.plan_id) now only ever consider recurring
-- registrations, so a special-day booking can never surface as
-- someone's displayed membership plan or receipt.
-- ---------------------------------------------------------------------
create or replace function admin_list_child_subscriptions()
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data order by (row_data->>'expires_on')), '[]'::json)
  from (
    select json_build_object(
      'child_id', ch.id,
      'child_name', ch.name,
      'date_of_birth', ch.date_of_birth,
      'gender', ch.gender,
      'school', ch.school,
      'interests', ch.interests,
      'allergies', ch.allergies,
      'medical_conditions', ch.medical_conditions,
      'special_instructions', ch.special_instructions,
      'parent_name', c.name,
      'phone', c.phone,
      'secondary_phone', c.secondary_phone,
      'address', c.address,
      'how_heard', c.how_heard,
      'photo_consent', c.photo_consent,
      'whatsapp_consent', c.whatsapp_consent,
      'active', cs.active,
      'started_on', cs.started_on,
      'expires_on', cs.expires_on,
      'plan_name', coalesce(
        mp.name,
        (
          select mp2.name
          from membership_registrations r
          join membership_plans mp2 on mp2.id = r.plan_id
          where (r.child_id = ch.id or r.renewal_child_id = ch.id)
            and r.status = 'confirmed'
            and mp2.plan_type = 'recurring'
          order by r.reviewed_at desc nulls last, r.submitted_at desc
          limit 1
        )
      ),
      'receipt_number', (
        select r.receipt_number
        from membership_registrations r
        join membership_plans mp2 on mp2.id = r.plan_id
        where (r.child_id = ch.id or r.renewal_child_id = ch.id)
          and r.status = 'confirmed'
          and mp2.plan_type = 'recurring'
        order by r.reviewed_at desc nulls last, r.submitted_at desc
        limit 1
      )
    ) as row_data
    from child_subscriptions cs
    join children ch on ch.id = cs.child_id
    join customers c on c.id = ch.customer_id
    left join membership_plans mp on mp.id = cs.plan_id
  ) results;
$$;

grant execute on function admin_list_child_subscriptions() to authenticated;