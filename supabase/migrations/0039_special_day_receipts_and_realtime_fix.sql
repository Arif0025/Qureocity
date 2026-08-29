-- =====================================================================
-- Migration 39: special-day receipt codes, renewal receipt reuse,
-- realtime fix for the pending-registrations badge
-- =====================================================================
-- Three fixes, all requested together:
--   A) Special-day plans stop consuming the shared Q-series membership
--      sequence. The admin names a short code on the plan itself (e.g.
--      "HAL" for a Halloween event) and receipts for that plan become
--      HAL-001, HAL-002, ... — scoped to that one plan, not counted as
--      a membership. That same code doubles as the URL slug for the
--      plan's public sign-up link (see the app-side changes).
--   B) A renewal that keeps the SAME recurring plan no longer mints a
--      new Q-id — it reuses the child's existing receipt number. Only
--      a genuine plan change gets a fresh one.
--   C) membership_registrations was never added to the realtime
--      publication (only play_sessions was, back in migration 0001),
--      so postgres_changes never fired for it — every badge/list tied
--      to pending registrations only ever updated on next page load.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Part A: plan codes + their own receipt sequence
-- ---------------------------------------------------------------------
alter table membership_plans
  add column if not exists code text,
  add column if not exists special_receipt_seq int not null default 0;

-- Only special-day plans need a code (it's both the receipt prefix and
-- the public URL slug), and it must be unique among them so a promo
-- link never resolves to the wrong event.
create unique index if not exists membership_plans_special_code_unique
  on membership_plans (upper(code))
  where plan_type = 'special';

alter table membership_plans
  add constraint membership_plans_special_needs_code
  check (plan_type <> 'special' or (code is not null and code <> ''));

create or replace function next_special_receipt(p_plan_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_seq int;
begin
  update membership_plans
    set special_receipt_seq = special_receipt_seq + 1
  where id = p_plan_id
  returning upper(code), special_receipt_seq into v_code, v_seq;

  if v_code is null or v_code = '' then
    v_code := 'SPL';
  end if;

  return v_code || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

-- receipt_number no longer needs to be globally unique — a same-plan
-- renewal deliberately reuses a prior value (Part B), and per-plan
-- special codes are only unique within their own plan, not globally.
alter table membership_registrations
  drop constraint if exists membership_registrations_receipt_number_key;

create index if not exists idx_membership_registrations_receipt_number
  on membership_registrations (receipt_number);

-- Reworked: choose the receipt scheme by the chosen plan's type.
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

  v_receipt := case
    when v_plan_type = 'special' then next_special_receipt(p_plan_id)
    else next_receipt_number()
  end;

  insert into membership_registrations (
    receipt_number, child_name, date_of_birth, gender, school, interests, allergies,
    medical_conditions, special_instructions, parent_name, phone,
    secondary_phone, address, plan_id, how_heard, photo_consent,
    whatsapp_consent
  ) values (
    v_receipt, trim(p_child_name), p_date_of_birth, p_gender, p_school,
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
-- Part B: renewals — same recurring plan reuses the existing receipt,
-- a plan change or a special-day booking gets its own new one.
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
    v_receipt := next_special_receipt(p_plan_id);
  else
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
    v_receipt, 'renewal', v_customer_id, p_child_id, p_plan_id
  )
  returning id, receipt_number into v_id, v_receipt;

  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;

-- ---------------------------------------------------------------------
-- Part C: realtime fix — this is the actual reason confirming or
-- discarding a registration needed a manual page refresh before the
-- pending badge/list updated elsewhere in the app.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'membership_registrations'
  ) then
    alter publication supabase_realtime add table membership_registrations;
  end if;
end $$;