-- =====================================================================
-- Migration 29: membership registration
-- =====================================================================
-- New kiosk-facing "Register as Member" flow, separate from the
-- pending-payment check-in queue built earlier. A parent fills out a
-- richer one-time form (child details, medical info, guardian details,
-- plan choice, consents) which lands as a pending row for admin review;
-- confirming it creates/links the customer + child + subscription and
-- the family becomes eligible for Quick Check-In as normal.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Part A: profile fields that didn't exist yet, added to the permanent
-- tables (not just the registration staging table) since this is data
-- that belongs to the customer/child going forward, not just metadata
-- about how they signed up.
-- ---------------------------------------------------------------------
alter table customers
  add column if not exists secondary_phone text,
  add column if not exists address text,
  add column if not exists how_heard text,
  add column if not exists photo_consent boolean not null default false,
  add column if not exists whatsapp_consent boolean not null default false;

alter table children
  add column if not exists gender text,
  add column if not exists school text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists allergies text,
  add column if not exists medical_conditions text,
  add column if not exists special_instructions text;

-- ---------------------------------------------------------------------
-- Part B: membership plans — admin-managed, shown live on the kiosk
-- registration form.
-- ---------------------------------------------------------------------
create table membership_plans (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  validity_value    int not null,               -- e.g. 3
  validity_unit     text not null check (validity_unit in ('weeks', 'months')),
  hours_per_visit   numeric not null,
  allowed_weekdays  int[] not null default '{0,1,2,3,4,5,6}', -- 0=Sun..6=Sat, minus Tue (closed) enforced at signup time
  min_age           int,
  max_age           int,
  price             numeric not null,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table membership_plans enable row level security;

-- Anyone (kiosk, unauthenticated) can see active plans to choose from.
create policy "anyone can read active plans" on membership_plans
  for select to anon, authenticated using (active = true or is_admin_member());

create policy "admin can insert plans" on membership_plans
  for insert to authenticated with check (is_admin_member());
create policy "admin can update plans" on membership_plans
  for update to authenticated using (is_admin_member());
create policy "admin can delete plans" on membership_plans
  for delete to authenticated using (is_admin_member());

grant select on membership_plans to anon;
grant select, insert, update, delete on membership_plans to authenticated;

-- ---------------------------------------------------------------------
-- Part C: receipt numbering — Q-001 style, sequential.
-- ---------------------------------------------------------------------
create sequence membership_receipt_seq start 1;

create or replace function next_receipt_number()
returns text
language sql
as $$
  select 'Q-' || lpad(nextval('membership_receipt_seq')::text, 3, '0');
$$;

-- ---------------------------------------------------------------------
-- Part D: registration staging table — one row per submitted form,
-- reviewed by an admin before it becomes a real customer/child/sub.
-- ---------------------------------------------------------------------
create type registration_status as enum ('pending', 'confirmed', 'discarded');

create table membership_registrations (
  id                     uuid primary key default gen_random_uuid(),
  receipt_number         text not null unique default next_receipt_number(),
  status                 registration_status not null default 'pending',

  -- child
  child_name             text not null,
  date_of_birth          date not null,
  gender                 text,
  school                 text,
  interests              text[] not null default '{}',
  allergies              text,
  medical_conditions     text,
  special_instructions   text,

  -- parent/guardian
  parent_name            text not null,
  phone                  text not null,
  secondary_phone        text,
  address                text,

  -- plan + attribution
  plan_id                uuid references membership_plans(id),
  how_heard              text,
  photo_consent          boolean not null default false,
  whatsapp_consent       boolean not null default false,

  -- resolved on confirm
  customer_id            uuid references customers(id),
  child_id               uuid references children(id),

  submitted_at           timestamptz not null default now(),
  reviewed_at            timestamptz,
  reviewed_by            uuid references employees(id)
);

create index idx_membership_registrations_status on membership_registrations(status);

alter table membership_registrations enable row level security;

create policy "staff can read registrations" on membership_registrations
  for select to authenticated using (is_staff_member() or is_admin_member());
create policy "staff can update registrations" on membership_registrations
  for update to authenticated using (is_staff_member() or is_admin_member());

grant select, update on membership_registrations to authenticated;

-- ---------------------------------------------------------------------
-- Part E: submit — public/kiosk-facing, rate limited like the other
-- kiosk RPCs. Returns the receipt number to show the parent immediately.
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

  insert into membership_registrations (
    child_name, date_of_birth, gender, school, interests, allergies,
    medical_conditions, special_instructions, parent_name, phone,
    secondary_phone, address, plan_id, how_heard, photo_consent,
    whatsapp_consent
  ) values (
    trim(p_child_name), p_date_of_birth, p_gender, p_school,
    coalesce(p_interests, '{}'), p_allergies, p_medical_conditions,
    p_special_instructions, trim(p_parent_name), trim(p_phone),
    p_secondary_phone, p_address, p_plan_id, p_how_heard,
    coalesce(p_photo_consent, false), coalesce(p_whatsapp_consent, false)
  )
  returning id, receipt_number into v_id, v_receipt;

  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;

grant execute on function submit_membership_registration(
  text, date, text, text, text[], text, text, text, text, text, text, text,
  uuid, text, boolean, boolean, text
) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Part F: confirm — creates/links customer + child + subscription.
-- If a customer already exists with this phone (returning family
-- adding another child), the new child is attached to them instead of
-- creating a duplicate customer.
-- ---------------------------------------------------------------------
create or replace function confirm_membership_registration(p_registration_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg membership_registrations;
  v_plan membership_plans;
  v_customer_id uuid;
  v_child_id uuid;
  v_expires_on date;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  select * into v_reg from membership_registrations
    where id = p_registration_id and status = 'pending';

  if v_reg.id is null then
    return json_build_object('success', false, 'reason', 'already_handled');
  end if;

  -- Link to an existing customer by phone, or create a new one.
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
    select * into v_plan from membership_plans where id = v_reg.plan_id;
    if v_plan.id is not null then
      v_expires_on := current_date + (
        case v_plan.validity_unit
          when 'weeks' then (v_plan.validity_value * 7 || ' days')::interval
          else (v_plan.validity_value || ' months')::interval
        end
      );
      insert into child_subscriptions (child_id, active, started_on, expires_on, duration_months)
      values (
        v_child_id, true, current_date, v_expires_on,
        case when v_plan.validity_unit = 'months' then v_plan.validity_value else null end
      )
      on conflict (child_id) do update set
        active = true,
        started_on = current_date,
        expires_on = v_expires_on,
        duration_months = excluded.duration_months,
        updated_at = now();
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

create or replace function discard_membership_registration(p_registration_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row membership_registrations;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  update membership_registrations
  set status = 'discarded',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_registration_id and status = 'pending'
  returning * into v_row;

  if v_row.id is null then
    return json_build_object('success', false, 'reason', 'already_handled');
  end if;

  return json_build_object('success', true);
end;
$$;

grant execute on function confirm_membership_registration(uuid) to authenticated;
grant execute on function discard_membership_registration(uuid) to authenticated;

-- Convenience read for the admin queue, with plan name joined in.
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
           'child_name', r.child_name,
           'date_of_birth', r.date_of_birth,
           'gender', r.gender,
           'school', r.school,
           'interests', r.interests,
           'allergies', r.allergies,
           'medical_conditions', r.medical_conditions,
           'special_instructions', r.special_instructions,
           'parent_name', r.parent_name,
           'phone', r.phone,
           'secondary_phone', r.secondary_phone,
           'address', r.address,
           'plan_id', r.plan_id,
           'plan_name', p.name,
           'how_heard', r.how_heard,
           'photo_consent', r.photo_consent,
           'whatsapp_consent', r.whatsapp_consent,
           'submitted_at', r.submitted_at
         ) order by r.submitted_at), '[]'::json)
  from membership_registrations r
  left join membership_plans p on p.id = r.plan_id
  where r.status = 'pending';
$$;

grant execute on function list_pending_registrations() to authenticated;