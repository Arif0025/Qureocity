-- =====================================================================
-- Migration 54: let old registrations outlive a deleted plan
-- =====================================================================
-- Migration 53's fix was too strict: it blocks deleting a plan as long
-- as ANY registration ever pointed at it — including long-confirmed
-- ones, not just live ones. "Remove from roster" only clears the LIVE
-- eligibility (child_special_passes); the original registration record
-- stays on purpose, as a receipt/audit trail. That means it's
-- impossible to ever fully delete a plan under migration 53's rule,
-- which isn't what was asked for.
--
-- Correct fix: keep the plan's NAME permanently on the registration
-- (a snapshot, independent of the plan row existing), but only require
-- a live plan_id link while the registration is still 'pending' — a
-- pending registration is actively being processed and genuinely needs
-- the real plan to confirm against. Once confirmed or discarded,
-- plan_id can safely go null when the plan is deleted; the snapshot
-- keeps history readable regardless.
-- =====================================================================

alter table membership_registrations
  add column if not exists plan_name_snapshot text;

update membership_registrations r
set plan_name_snapshot = mp.name
from membership_plans mp
where mp.id = r.plan_id and r.plan_name_snapshot is null;

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
       and (plan_id is not null or status <> 'pending'))
    or
    (registration_type = 'special'
       and (plan_id is not null or status <> 'pending')
       and (
         (renewal_customer_id is not null and renewal_child_id is not null)
         or
         (child_name is not null and date_of_birth is not null
            and parent_name is not null and phone is not null)
       ))
  );

-- Safe to go back to SET NULL now that confirmed/discarded rows no
-- longer require a live plan_id — a plan can only be deleted once
-- nothing still-pending references it, which is exactly right (you
-- shouldn't be able to delete a plan someone has an open application
-- for).
alter table membership_registrations
  drop constraint if exists membership_registrations_plan_id_fkey;
alter table membership_registrations
  add constraint membership_registrations_plan_id_fkey
  foreign key (plan_id) references membership_plans(id) on delete set null;

-- Take the snapshot going forward too.
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
  v_plan_name text;
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
    select plan_type, name into v_plan_type, v_plan_name
    from membership_plans where id = p_plan_id;
  end if;

  v_reg_type := case when v_plan_type = 'special' then 'special' else 'new' end;
  v_receipt := case
    when v_plan_type = 'special' then next_special_receipt(p_plan_id)
    else next_receipt_number()
  end;

  insert into membership_registrations (
    receipt_number, registration_type, child_name, date_of_birth, gender, school,
    interests, allergies, medical_conditions, special_instructions, parent_name,
    phone, secondary_phone, address, plan_id, plan_name_snapshot, how_heard,
    photo_consent, whatsapp_consent
  ) values (
    v_receipt, v_reg_type, trim(p_child_name), p_date_of_birth, p_gender, p_school,
    coalesce(p_interests, '{}'), p_allergies, p_medical_conditions,
    p_special_instructions, trim(p_parent_name), trim(p_phone),
    p_secondary_phone, p_address, p_plan_id, v_plan_name, p_how_heard,
    coalesce(p_photo_consent, false), coalesce(p_whatsapp_consent, false)
  )
  returning id, receipt_number into v_id, v_receipt;

  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;

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
    receipt_number, registration_type, renewal_customer_id, renewal_child_id,
    plan_id, plan_name_snapshot
  ) values (
    v_receipt, v_reg_type, v_customer_id, p_child_id, p_plan_id, v_plan.name
  )
  returning id, receipt_number into v_id, v_receipt;

  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;

-- Fall back to the snapshot wherever plan_name is displayed from a
-- registration row, so a deleted plan's name still shows in history.
create or replace function list_pending_registrations()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
           'id', r.id,
           'receipt_number', r.receipt_number,
           'registration_type', r.registration_type,
           'child_name', coalesce(r.child_name, rc.name),
           'date_of_birth', coalesce(r.date_of_birth, rc.date_of_birth),
           'gender', r.gender,
           'school', r.school,
           'interests', r.interests,
           'allergies', r.allergies,
           'medical_conditions', r.medical_conditions,
           'special_instructions', r.special_instructions,
           'parent_name', coalesce(r.parent_name, ru.name),
           'phone', coalesce(r.phone, ru.phone),
           'secondary_phone', r.secondary_phone,
           'address', r.address,
           'plan_id', r.plan_id,
           'plan_name', coalesce(p.name, r.plan_name_snapshot),
           'plan_type', p.plan_type,
           'plan_event_date', p.event_date,
           'how_heard', r.how_heard,
           'photo_consent', r.photo_consent,
           'whatsapp_consent', r.whatsapp_consent,
           'submitted_at', r.submitted_at
         ) order by r.submitted_at), '[]'::json)
  from membership_registrations r
  left join membership_plans p on p.id = r.plan_id
  left join children rc on rc.id = r.renewal_child_id
  left join customers ru on ru.id = r.renewal_customer_id
  where r.status = 'pending';
$$;