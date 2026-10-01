-- Multi-date special events. A plan is still a one-visit pass; event_dates
-- are the dates on which that same pass may be used.

alter table membership_plans
  add column if not exists event_dates date[] not null default '{}';

update membership_plans
set event_dates = array[event_date]
where plan_type = 'special'
  and cardinality(event_dates) = 0
  and event_date is not null;

alter table membership_registrations
  add column if not exists special_event_date date;

alter table membership_plans
  drop constraint if exists membership_plans_special_needs_event_dates;
alter table membership_plans
  add constraint membership_plans_special_needs_event_dates
  check (plan_type <> 'special' or cardinality(event_dates) > 0);

-- The selected date is stored on the pending registration. Existing callers
-- and historical registrations continue to use the legacy event_date.
create or replace function submit_special_registration(
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
  p_event_date date,
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
  v_plan membership_plans;
begin
  if not check_rate_limit('register:' || p_client_key, 5, 300) then
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'P0001';
  end if;
  if p_child_name is null or trim(p_child_name) = '' then raise exception 'Child name is required.'; end if;
  if p_parent_name is null or trim(p_parent_name) = '' then raise exception 'Parent/guardian name is required.'; end if;
  if p_phone is null or trim(p_phone) = '' then raise exception 'Phone number is required.'; end if;

  select * into v_plan from membership_plans
  where id = p_plan_id and plan_type = 'special' and active = true;
  if v_plan.id is null then raise exception 'That special day is no longer available.'; end if;
  if p_event_date is null or not (p_event_date = any(coalesce(v_plan.event_dates, array[v_plan.event_date]))) then
    raise exception 'Choose one of the available event dates.';
  end if;
  if p_event_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Registration for this date has closed.';
  end if;

  v_receipt := next_special_receipt(p_plan_id);
  insert into membership_registrations (
    receipt_number, registration_type, child_name, date_of_birth, gender, school,
    interests, allergies, medical_conditions, special_instructions, parent_name,
    phone, secondary_phone, address, plan_id, special_event_date, how_heard,
    photo_consent, whatsapp_consent
  ) values (
    v_receipt, 'special', trim(p_child_name), p_date_of_birth, p_gender, p_school,
    coalesce(p_interests, '{}'), p_allergies, p_medical_conditions, p_special_instructions,
    trim(p_parent_name), trim(p_phone), p_secondary_phone, p_address, p_plan_id,
    p_event_date, p_how_heard, coalesce(p_photo_consent, false), coalesce(p_whatsapp_consent, false)
  ) returning id into v_id;
  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;

create or replace function submit_special_renewal(
  p_phone text,
  p_child_id uuid,
  p_plan_id uuid,
  p_event_date date,
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
begin
  if not check_rate_limit('renewal:' || p_client_key, 5, 300) then
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'P0001';
  end if;
  select c.customer_id into v_customer_id
  from children c join customers cu on cu.id = c.customer_id
  where c.id = p_child_id and cu.phone = p_phone;
  if v_customer_id is null then raise exception 'We could not match that child to this phone number.'; end if;

  select * into v_plan from membership_plans
  where id = p_plan_id and plan_type = 'special' and active = true;
  if v_plan.id is null then raise exception 'That special day is no longer available.'; end if;
  if p_event_date is null or not (p_event_date = any(coalesce(v_plan.event_dates, array[v_plan.event_date]))) then
    raise exception 'Choose one of the available event dates.';
  end if;
  if p_event_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Registration for this date has closed.';
  end if;

  v_receipt := next_special_receipt(p_plan_id);
  insert into membership_registrations (
    receipt_number, registration_type, renewal_customer_id, renewal_child_id,
    plan_id, special_event_date
  ) values (v_receipt, 'special', v_customer_id, p_child_id, p_plan_id, p_event_date)
  returning id into v_id;
  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;

grant execute on function submit_special_registration(text, date, text, text, text[], text, text, text, text, text, text, text, uuid, date, text, boolean, boolean, text) to anon, authenticated;
grant execute on function submit_special_renewal(text, uuid, uuid, date, text) to anon, authenticated;

-- Existing confirmation logic creates the pass from membership_plans.event_date.
-- Correct that pass to the date selected on the registration after confirmation.
create or replace function sync_special_registration_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' and new.special_event_date is not null
     and new.child_id is not null and new.plan_id is not null then
    update child_special_passes
    set event_date = new.special_event_date
    where child_id = new.child_id and plan_id = new.plan_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_special_registration_date on membership_registrations;
create trigger trg_sync_special_registration_date
after update of status, child_id on membership_registrations
for each row execute function sync_special_registration_date();

create or replace function list_pending_registrations()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin_member() then raise exception 'Not authorized.'; end if;
  return (
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
      'special_event_date', r.special_event_date,
      'how_heard', r.how_heard,
      'photo_consent', r.photo_consent,
      'whatsapp_consent', r.whatsapp_consent,
      'submitted_at', r.submitted_at
    ) order by r.submitted_at), '[]'::json)
    from membership_registrations r
    left join membership_plans p on p.id = r.plan_id
    left join children rc on rc.id = r.renewal_child_id
    left join customers ru on ru.id = r.renewal_customer_id
    where r.status = 'pending'
  );
end;
$$;

grant execute on function list_pending_registrations() to authenticated;

notify pgrst, 'reload schema';