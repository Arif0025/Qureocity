-- Special registrations do not choose a date. The first check-in on any
-- configured event date claims the pass; completed passes can be registered
-- again while the event remains open.

alter table child_special_passes
  alter column event_date drop not null;

create or replace function special_pass_is_open(p_child_id uuid, p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from child_special_passes csp
    where csp.child_id = p_child_id
      and csp.plan_id = p_plan_id
      and not exists (
        select 1 from play_sessions ps
        where ps.special_pass_id = csp.id
          and ps.status in ('completed', 'expired')
      )
  );
$$;

-- No-date overload used by the current UI. The older date-taking overload
-- remains for compatibility but is no longer called by the application.
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
  select * into v_plan from membership_plans
  where id = p_plan_id and plan_type = 'special' and active = true;
  if v_plan.id is null then raise exception 'That special day is no longer available.'; end if;
  if v_plan.event_dates is null or cardinality(v_plan.event_dates) = 0 then
    raise exception 'That special day has no available dates.';
  end if;
  if (now() at time zone 'Asia/Kolkata')::date > (select max(d) from unnest(v_plan.event_dates) as d) then
    raise exception 'Registration for this event has closed.';
  end if;
  if p_child_name is null or trim(p_child_name) = '' then raise exception 'Child name is required.'; end if;
  if p_parent_name is null or trim(p_parent_name) = '' then raise exception 'Parent/guardian name is required.'; end if;
  if p_phone is null or trim(p_phone) = '' then raise exception 'Phone number is required.'; end if;
  if exists (
    select 1 from membership_registrations r
    where r.phone = trim(p_phone) and r.plan_id = p_plan_id and r.status = 'pending'
  ) then
    raise exception 'This family is already registered for this event.' using errcode = 'P0001';
  end if;

  v_receipt := next_special_receipt(p_plan_id);
  insert into membership_registrations (
    receipt_number, registration_type, child_name, date_of_birth, gender, school,
    interests, allergies, medical_conditions, special_instructions, parent_name,
    phone, secondary_phone, address, plan_id, how_heard, photo_consent, whatsapp_consent
  ) values (
    v_receipt, 'special', trim(p_child_name), p_date_of_birth, p_gender, p_school,
    coalesce(p_interests, '{}'), p_allergies, p_medical_conditions, p_special_instructions,
    trim(p_parent_name), trim(p_phone), p_secondary_phone, p_address, p_plan_id,
    p_how_heard, coalesce(p_photo_consent, false), coalesce(p_whatsapp_consent, false)
  ) returning id into v_id;
  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;

create or replace function submit_special_renewal(
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
  if v_plan.event_dates is null or cardinality(v_plan.event_dates) = 0
     or (now() at time zone 'Asia/Kolkata')::date > (select max(d) from unnest(v_plan.event_dates) as d) then
    raise exception 'Registration for this event has closed.';
  end if;
  if special_pass_is_open(p_child_id, p_plan_id) then
    raise exception 'This child is already registered for this event.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from membership_registrations r
    where r.renewal_child_id = p_child_id and r.plan_id = p_plan_id and r.status = 'pending'
  ) then
    raise exception 'This child is already registered for this event.' using errcode = 'P0001';
  end if;

  v_receipt := next_special_receipt(p_plan_id);
  insert into membership_registrations (
    receipt_number, registration_type, renewal_customer_id, renewal_child_id, plan_id
  ) values (v_receipt, 'special', v_customer_id, p_child_id, p_plan_id)
  returning id into v_id;
  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;

grant execute on function submit_special_registration(text, date, text, text, text[], text, text, text, text, text, text, text, uuid, text, boolean, boolean, text) to anon, authenticated;
grant execute on function submit_special_renewal(text, uuid, uuid, text) to anon, authenticated;

-- A confirmed new registration initially creates a pass through the legacy
-- confirmation function. Clear its legacy date so the first check-in claims it.
create or replace function sync_special_registration_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' and new.child_id is not null and new.plan_id is not null
     and exists (select 1 from membership_plans p where p.id = new.plan_id and p.plan_type = 'special') then
    update child_special_passes
    set event_date = new.special_event_date
    where child_id = new.child_id and plan_id = new.plan_id;
  end if;
  return new;
end;
$$;

-- Return true only for an unused/current pass or a pending registration.
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
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'P0001';
  end if;
  select * into v_customer from customers where phone = p_phone;
  if v_customer.id is null then return json_build_object('found', false); end if;

  select json_agg(json_build_object(
    'id', c.id,
    'name', c.name,
    'age', date_part('year', age(current_date, c.date_of_birth)),
    'current_plan_name', mp.name,
    'current_plan_expires_on', cs.expires_on,
    'current_plan_active', coalesce(cs.active and (cs.expires_on is null or cs.expires_on >= current_date), false),
    'already_registered_for_plan', p_plan_id is not null and (
      special_pass_is_open(c.id, p_plan_id)
      or exists (
        select 1 from membership_registrations r
        where r.renewal_child_id = c.id and r.plan_id = p_plan_id and r.status = 'pending'
      )
    )
  ) order by c.name) into v_children
  from children c
  left join child_subscriptions cs on cs.child_id = c.id
  left join membership_plans mp on mp.id = (
    select r2.plan_id from membership_registrations r2
    join membership_plans mp2 on mp2.id = r2.plan_id
    where r2.renewal_child_id = c.id and r2.status = 'confirmed' and mp2.plan_type = 'recurring'
    order by r2.reviewed_at desc nulls last, r2.submitted_at desc limit 1
  )
  where c.customer_id = v_customer.id;

  return json_build_object('found', true, 'customer_id', v_customer.id,
    'parent_name', v_customer.name, 'children', coalesce(v_children, '[]'::json));
end;
$$;

-- Claim an unassigned pass before the existing visit-limit checks run.
create or replace function checkin_claim_special_passes(p_child_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update child_special_passes csp
  set event_date = (now() at time zone 'Asia/Kolkata')::date
  from membership_plans p
  where csp.plan_id = p.id
    and p.plan_type = 'special'
    and csp.event_date is null
    and (now() at time zone 'Asia/Kolkata')::date = any(p.event_dates)
    and csp.child_id = any(p_child_ids)
    and not exists (
      select 1 from play_sessions ps
      where ps.special_pass_id = csp.id and ps.status in ('active', 'pending_payment')
    );
$$;

revoke all on function checkin_claim_special_passes(uuid[]) from public, anon, authenticated;

grant execute on function renewal_lookup(text, text, uuid) to anon, authenticated;

create or replace function checkin_create_sessions(
  p_customer_id uuid,
  p_child_ids uuid[],
  p_duration_mins int,
  p_client_key text,
  p_status session_status default 'active'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad_count int;
  v_already_in_count int;
  v_sessions json;
  v_exhausted_name text;
begin
  if not check_rate_limit('session:' || p_client_key, 10, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'P0001';
  end if;
  if p_status <> 'active' then raise exception 'Walk-in sessions are recorded as active.'; end if;

  select count(*) into v_bad_count from unnest(p_child_ids) as cid
  where not exists (select 1 from children c where c.id = cid and c.customer_id = p_customer_id);
  if v_bad_count > 0 then raise exception 'One or more selected children could not be verified.'; end if;

  select count(*) into v_already_in_count from unnest(p_child_ids) as cid
  where exists (select 1 from play_sessions ps where ps.child_id = cid and ps.status = 'active');
  if v_already_in_count > 0 then raise exception 'One or more selected children are already checked in.'; end if;
  if p_duration_mins is not null and p_duration_mins not in (60, 120) then raise exception 'Invalid duration.'; end if;

  perform checkin_claim_special_passes(p_child_ids);

  select ch.name into v_exhausted_name
  from unnest(p_child_ids) as cid
  join children ch on ch.id = cid
  join child_subscriptions cs on cs.child_id = cid
  where cs.active = true
    and (cs.expires_on is null or cs.expires_on >= current_date)
    and cs.max_visits is not null
    and cs.visits_used >= cs.max_visits
    and not exists (
      select 1 from child_special_passes csp
      where csp.child_id = cid and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
    )
  limit 1;
  if v_exhausted_name is not null then
    raise exception '% has no visits left on their plan.', v_exhausted_name using errcode = 'P0001';
  end if;

  with inserted as (
    insert into play_sessions (child_id, duration_mins, status, special_pass_id)
    select cid, p_duration_mins, 'active'::session_status,
      (select csp.id from child_special_passes csp
       where csp.child_id = cid and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
       limit 1)
    from unnest(p_child_ids) as cid
    returning id, child_id, start_time, end_time, status, special_pass_id
  )
  select json_agg(json_build_object(
    'session_id', i.id, 'child_id', i.child_id, 'start_time', i.start_time,
    'end_time', i.end_time, 'status', i.status, 'special_pass_id', i.special_pass_id
  )) into v_sessions from inserted i;

  update child_subscriptions cs
  set visits_used = cs.visits_used + 1, updated_at = now()
  where cs.child_id in (
    select cid from unnest(p_child_ids) as cid
    where not exists (
      select 1 from child_special_passes csp
      where csp.child_id = cid and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
    )
  )
  and cs.active = true
  and (cs.expires_on is null or cs.expires_on >= current_date)
  and cs.max_visits is not null;

  return json_build_object('sessions', v_sessions);
end;
$$;

grant execute on function checkin_create_sessions(uuid, uuid[], int, text, session_status) to anon, authenticated;

notify pgrst, 'reload schema';