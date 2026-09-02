-- Migration 60: finalize admin/staff access and record manual memberships.

-- Only admins should see pending registration details, including medical
-- and contact information. Staff can still use the subscriber RPC below
-- to check plan status and validity.
create or replace function list_pending_registrations()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

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

-- The special-day roster contains customer data and is for admins. Active
-- special-day plans themselves remain publicly readable through RLS so
-- customers can inspect the offering before registering.
create or replace function admin_list_special_passes(p_plan_id uuid default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  return (
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
    ) results
  );
end;
$$;

-- Employees may inspect subscriber status, so this RPC intentionally stays
-- available to authenticated staff. It does not expose pending PII.
create or replace function admin_list_child_subscriptions()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_data order by (row_data->>'expires_on')), '[]'::json)
  from (
    select json_build_object(
      'child_id', ch.id,
      'child_name', ch.name,
      'parent_name', c.name,
      'phone', c.phone,
      'active', cs.active,
      'started_on', cs.started_on,
      'expires_on', cs.expires_on
    ) as row_data
    from child_subscriptions cs
    join children ch on ch.id = cs.child_id
    join customers c on c.id = ch.customer_id
  ) results;
$$;

-- Non-admin employees can see only their own summary. Admins get the full
-- team summary when p_employee_id is omitted, or a selected employee.
drop function if exists admin_staff_attendance_summary(date, uuid);
create or replace function admin_staff_attendance_summary(
  p_month_start date default date_trunc('month', current_date)::date,
  p_employee_id uuid default null
)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select case
      when is_admin_member() then p_employee_id
      else auth.uid()
    end as employee_id
  ), bounds as (
    select
      p_month_start as month_start,
      (p_month_start + interval '1 month')::date as month_end_excl,
      least((p_month_start + interval '1 month')::date, (current_date + 1)) as to_date_excl
  ), open_days as (
    select count(*) as open_day_count
    from bounds, generate_series(bounds.month_start, bounds.to_date_excl - 1, interval '1 day') as d
    where extract(dow from d) <> 2
  )
  select coalesce(json_agg(row_data order by (row_data->>'employee_name')), '[]'::json)
  from (
    select json_build_object(
      'employee_id', e.id,
      'employee_name', e.name,
      'role', e.role,
      'actual_working_days', (
        select count(distinct date(al.punch_in at time zone 'Asia/Kolkata'))
        from attendance_logs al, bounds
        where al.employee_id = e.id
          and al.punch_in >= bounds.month_start
          and al.punch_in < bounds.month_end_excl
          and extract(dow from (al.punch_in at time zone 'Asia/Kolkata')) <> 2
      ),
      'total_hours_this_month', (
        select coalesce(sum(round((extract(epoch from (coalesce(al.punch_out, now()) - al.punch_in)) / 1800)) * 0.5), 0)
        from attendance_logs al, bounds
        where al.employee_id = e.id
          and al.punch_in >= bounds.month_start
          and al.punch_in < bounds.month_end_excl
          and extract(dow from (al.punch_in at time zone 'Asia/Kolkata')) <> 2
      ),
      'scheduled_hours_this_month', (
        select case when s.id is null then null else round(
          (extract(epoch from (s.end_time - s.start_time)) / 3600.0)
          * (select open_day_count from open_days), 1
        ) end
        from shifts s where s.employee_id = e.id
      ),
      'working_days_this_month', (select open_day_count from open_days)
    ) as row_data
    from employees e, requested
    where requested.employee_id is null or e.id = requested.employee_id
  ) results;
$$;

-- Manual admin activation creates the same confirmed registration history
-- as the kiosk flow, including a fresh membership receipt number.
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
  v_child children;
  v_customer_id uuid;
  v_registration_id uuid;
  v_receipt text;
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

  select * into v_child from children where id = p_child_id;
  if v_child.id is null then
    raise exception 'Child not found.' using errcode = 'P0001';
  end if;
  v_customer_id := v_child.customer_id;
  v_receipt := next_receipt_number();

  perform apply_plan_to_child(p_child_id, p_plan_id, p_started_on);

  insert into membership_registrations (
    receipt_number, status, registration_type, renewal_customer_id,
    renewal_child_id, plan_id, plan_name_snapshot, customer_id, child_id,
    reviewed_at, reviewed_by
  ) values (
    v_receipt, 'confirmed', 'renewal', v_customer_id, p_child_id, p_plan_id,
    v_plan.name, v_customer_id, p_child_id, now(), auth.uid()
  ) returning id into v_registration_id;

  return json_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'receipt_number', v_receipt
  );
end;
$$;

grant execute on function list_pending_registrations() to authenticated;
grant execute on function admin_list_special_passes(uuid) to authenticated;
grant execute on function admin_list_child_subscriptions() to authenticated;
grant execute on function admin_staff_attendance_summary(date, uuid) to authenticated;
grant execute on function admin_apply_plan_to_child(uuid, uuid, date) to authenticated;