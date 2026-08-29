-- =====================================================================
-- Migration 35: membership renewals + one-day "special" plans
-- =====================================================================
-- Three additive features:
--   A) membership_plans gets a plan_type ('recurring' | 'special'). A
--      special plan is pinned to one calendar event_date instead of a
--      rolling validity window.
--   B) child_special_passes — a NEW, separate table from
--      child_subscriptions. A special-day pass must NOT collide with a
--      child's regular monthly membership (child_subscriptions is still
--      one-row-per-child), and a child could hold passes for several
--      different special dates over time, so this is modelled as its
--      own additive table rather than overloading child_subscriptions.
--   C) A renewal path: an existing member enters their phone number,
--      picks a child + a plan, and skips re-entering child/guardian
--      details. Reuses the membership_registrations staging table +
--      admin confirm queue already in place, tagged with
--      registration_type = 'renewal'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Part A: plan_type + event_date on membership_plans
-- ---------------------------------------------------------------------
alter table membership_plans
  add column if not exists plan_type text not null default 'recurring'
    check (plan_type in ('recurring', 'special')),
  add column if not exists event_date date;

alter table membership_plans
  add constraint membership_plans_special_needs_date
  check (plan_type <> 'special' or event_date is not null);

-- ---------------------------------------------------------------------
-- Part B: one-day special passes, additive alongside a regular
-- membership. Unique per (child, plan) — a family can't double-book the
-- same special day twice, but a child can hold both a recurring
-- membership and any number of special-day passes at once.
-- ---------------------------------------------------------------------
create table child_special_passes (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references children(id) on delete cascade,
  plan_id      uuid not null references membership_plans(id),
  event_date   date not null,
  purchased_at timestamptz not null default now(),
  unique (child_id, plan_id)
);

create index idx_child_special_passes_event_date on child_special_passes(event_date);

alter table child_special_passes enable row level security;

create policy "staff can read special passes" on child_special_passes
  for select to authenticated using (is_staff_member() or is_admin_member());
create policy "admin can manage special passes" on child_special_passes
  for all to authenticated using (is_admin_member()) with check (is_admin_member());

grant select, insert, update, delete on child_special_passes to authenticated;

-- ---------------------------------------------------------------------
-- Part C: extend membership_registrations to also stage renewals.
-- A renewal already knows the customer + child (looked up by phone), so
-- the "new member" fields are no longer universally required — relaxed
-- to nullable and enforced instead by a type-specific check constraint.
-- ---------------------------------------------------------------------
alter table membership_registrations
  add column if not exists registration_type text not null default 'new'
    check (registration_type in ('new', 'renewal')),
  add column if not exists renewal_customer_id uuid references customers(id),
  add column if not exists renewal_child_id uuid references children(id);

alter table membership_registrations alter column child_name drop not null;
alter table membership_registrations alter column date_of_birth drop not null;
alter table membership_registrations alter column parent_name drop not null;
alter table membership_registrations alter column phone drop not null;

alter table membership_registrations
  add constraint membership_registrations_type_fields check (
    (registration_type = 'new'
       and child_name is not null and date_of_birth is not null
       and parent_name is not null and phone is not null)
    or
    (registration_type = 'renewal'
       and renewal_customer_id is not null and renewal_child_id is not null
       and plan_id is not null)
  );

-- ---------------------------------------------------------------------
-- Part D: renewal lookup — public/kiosk-facing, phone in, customer +
-- children (with their current plan standing) out. Mirrors
-- checkin_lookup's shape and rate-limit pattern.
-- ---------------------------------------------------------------------
create or replace function renewal_lookup(p_phone text, p_client_key text)
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
           )
         ) order by c.name)
  into v_children
  from children c
  left join child_subscriptions cs on cs.child_id = c.id
  left join membership_plans mp on mp.id = (
    select r2.plan_id from membership_registrations r2
    where r2.renewal_child_id = c.id and r2.status = 'confirmed'
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

grant execute on function renewal_lookup(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Part E: submit a renewal — public/kiosk-facing. The phone is
-- re-verified server-side against the child, so the kiosk can't be
-- coaxed into renewing someone else's child by tampering with the
-- client-held customer_id.
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

  if not exists (select 1 from membership_plans where id = p_plan_id and active = true) then
    raise exception 'That plan is no longer available.' using errcode = 'P0001';
  end if;

  insert into membership_registrations (
    registration_type, renewal_customer_id, renewal_child_id, plan_id
  ) values (
    'renewal', v_customer_id, p_child_id, p_plan_id
  )
  returning id, receipt_number into v_id, v_receipt;

  return json_build_object('registration_id', v_id, 'receipt_number', v_receipt);
end;
$$;

grant execute on function submit_membership_renewal(text, uuid, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Part F: apply a plan to a child on confirm — shared by both the new-
-- member and renewal confirm paths so special vs recurring handling
-- only lives in one place.
-- ---------------------------------------------------------------------
create or replace function apply_plan_to_child(p_child_id uuid, p_plan_id uuid)
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
    v_expires_on := current_date + (
      case v_plan.validity_unit
        when 'weeks' then (v_plan.validity_value * 7 || ' days')::interval
        else (v_plan.validity_value || ' months')::interval
      end
    );
    insert into child_subscriptions (child_id, active, started_on, expires_on, duration_months)
    values (
      p_child_id, true, current_date, v_expires_on,
      case when v_plan.validity_unit = 'months' then v_plan.validity_value else null end
    )
    on conflict (child_id) do update set
      active = true,
      started_on = current_date,
      expires_on = v_expires_on,
      duration_months = excluded.duration_months,
      updated_at = now();
  end if;
end;
$$;

-- Rewritten to delegate plan application to apply_plan_to_child, and to
-- handle the renewal path (existing customer + child, no inserts needed
-- there — just apply the plan).
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

  if v_reg.registration_type = 'renewal' then
    v_customer_id := v_reg.renewal_customer_id;
    v_child_id := v_reg.renewal_child_id;
    perform apply_plan_to_child(v_child_id, v_reg.plan_id);
  else
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

-- Pending queue read now also surfaces renewal rows, with child/parent
-- names resolved from the linked records instead of the staging
-- columns (which are null for renewals).
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
           'plan_name', p.name,
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

-- ---------------------------------------------------------------------
-- Part G: club check-in integration — children with a special-day pass
-- valid TODAY (IST) should show up in Quick Check-In right alongside
-- regular active subscribers, so staff on the day of the event see
-- them without doing anything extra.
-- ---------------------------------------------------------------------
create or replace function checkin_search_active_subscribers(p_query text)
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'child_id', ch.id,
      'child_name', ch.name,
      'age', date_part('year', age(current_date, ch.date_of_birth)),
      'customer_id', c.id,
      'parent_name', c.name,
      'phone_last4', right(c.phone, 4),
      'currently_checked_in', exists(
        select 1 from play_sessions ps where ps.child_id = ch.id and ps.status = 'active'
      ),
      'active_session_id', (
        select ps.id from play_sessions ps
        where ps.child_id = ch.id and ps.status = 'active'
        limit 1
      ),
      'is_special_today', exists(
        select 1 from child_special_passes csp
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
      )
    ) as row_data
    from children ch
    join customers c on c.id = ch.customer_id
    where
      p_query <> ''
      and ch.name ilike '%' || p_query || '%'
      and (
        exists (
          select 1 from child_subscriptions cs
          where cs.child_id = ch.id and cs.active = true
            and (cs.expires_on is null or cs.expires_on >= current_date)
        )
        or exists (
          select 1 from child_special_passes csp
          where csp.child_id = ch.id
            and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
        )
      )
    order by ch.name
    limit 20
  ) results;
$$;

create or replace function checkin_list_active_subscribers()
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'child_id', ch.id,
      'child_name', ch.name,
      'age', date_part('year', age(current_date, ch.date_of_birth)),
      'customer_id', c.id,
      'parent_name', c.name,
      'phone_last4', right(c.phone, 4),
      'currently_checked_in', exists(
        select 1 from play_sessions ps where ps.child_id = ch.id and ps.status = 'active'
      ),
      'active_session_id', (
        select ps.id from play_sessions ps where ps.child_id = ch.id and ps.status = 'active' limit 1
      ),
      'is_special_today', exists(
        select 1 from child_special_passes csp
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
      )
    ) as row_data
    from children ch
    join customers c on c.id = ch.customer_id
    where
      exists (
        select 1 from child_subscriptions cs
        where cs.child_id = ch.id and cs.active = true
          and (cs.expires_on is null or cs.expires_on >= current_date)
      )
      or exists (
        select 1 from child_special_passes csp
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
      )
    order by
      (exists (
        select 1 from child_special_passes csp
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
      )) desc,
      ch.name
    limit 12
  ) results;
$$;

grant execute on function checkin_search_active_subscribers(text) to authenticated;
grant execute on function checkin_list_active_subscribers() to authenticated;

-- Admin-facing read of today's/upcoming special-day rosters.
create or replace function admin_list_special_passes(p_plan_id uuid default null)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_data order by (row_data->>'event_date'), (row_data->>'child_name')), '[]'::json)
  from (
    select json_build_object(
      'id', csp.id,
      'child_id', ch.id,
      'child_name', ch.name,
      'parent_name', c.name,
      'phone', c.phone,
      'plan_id', p.id,
      'plan_name', p.name,
      'event_date', csp.event_date,
      'purchased_at', csp.purchased_at
    ) as row_data
    from child_special_passes csp
    join children ch on ch.id = csp.child_id
    join customers c on c.id = ch.customer_id
    join membership_plans p on p.id = csp.plan_id
    where p_plan_id is null or csp.plan_id = p_plan_id
  ) results;
$$;

grant execute on function admin_list_special_passes(uuid) to authenticated;