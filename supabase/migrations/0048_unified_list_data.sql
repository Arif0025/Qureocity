-- =====================================================================
-- Migration 48: data for the unified list pattern
-- =====================================================================
-- Three lists need richer, single-call data than what's currently
-- fetched client-side via PostgREST embeds:
--   A) Kids checked in — needs age, session length, membership status
--      and receipt number, none of which the current flat query has.
--   B) Team today — needs EVERY staff member (not just on-duty), each
--      resolved to Present / Left / Absent for today specifically.
--   C) Directory — needs each child's plan name, not just whether a
--      subscription is active.
-- =====================================================================

create or replace function dashboard_list_checked_in_kids()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_data order by (row_data->>'start_time')), '[]'::json)
  from (
    select json_build_object(
      'session_id', ps.id,
      'child_id', ch.id,
      'child_name', ch.name,
      'age', date_part('year', age(current_date, ch.date_of_birth)),
      'start_time', ps.start_time,
      'end_time', ps.end_time,
      'status', ps.status,
      'parent_name', c.name,
      'phone', c.phone,
      'allergies', ch.allergies,
      'medical_conditions', ch.medical_conditions,
      'special_instructions', ch.special_instructions,
      'is_member', exists (
        select 1 from child_subscriptions cs
        where cs.child_id = ch.id and cs.active = true
          and (cs.expires_on is null or cs.expires_on >= current_date)
      ),
      'plan_name', mp.name,
      'is_special_today', ps.special_pass_id is not null,
      'special_plan_name', smp.name,
      'receipt_number', (
        select r.receipt_number
        from membership_registrations r
        where (r.child_id = ch.id or r.renewal_child_id = ch.id)
          and r.status = 'confirmed'
        order by r.reviewed_at desc nulls last, r.submitted_at desc
        limit 1
      )
    ) as row_data
    from play_sessions ps
    join children ch on ch.id = ps.child_id
    join customers c on c.id = ch.customer_id
    left join child_subscriptions cs2 on cs2.child_id = ch.id
    left join membership_plans mp on mp.id = cs2.plan_id
    left join child_special_passes csp on csp.id = ps.special_pass_id
    left join membership_plans smp on smp.id = csp.plan_id
    where ps.status = 'active'
  ) results;
$$;

grant execute on function dashboard_list_checked_in_kids() to authenticated;

create or replace function dashboard_list_team_today()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_data order by
    case (row_data->>'status') when 'present' then 0 when 'left' then 1 else 2 end,
    (row_data->>'employee_name')
  ), '[]'::json)
  from (
    select json_build_object(
      'employee_id', e.id,
      'employee_name', e.name,
      'role', e.role,
      'status', case
        when latest.punch_in is null then 'absent'
        when latest.punch_out is null then 'present'
        else 'left'
      end,
      'punch_in', latest.punch_in,
      'punch_out', latest.punch_out,
      'attendance_log_id', latest.id
    ) as row_data
    from employees e
    left join lateral (
      select al.id, al.punch_in, al.punch_out
      from attendance_logs al
      where al.employee_id = e.id
        and al.punch_in >= (
          (now() at time zone 'Asia/Kolkata')::date
        )::timestamp at time zone 'Asia/Kolkata'
      order by al.punch_in desc
      limit 1
    ) latest on true
    where e.role <> 'admin'
  ) results;
$$;

grant execute on function dashboard_list_team_today() to authenticated;

-- ---------------------------------------------------------------------
-- Directory — add plan_name per child alongside the existing
-- subscription_active/expires_on fields.
-- ---------------------------------------------------------------------
create or replace function staff_search_customers(p_query text, p_plan_id uuid default null)
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'customer_id', c.id,
      'parent_name', c.name,
      'phone', c.phone,
      'any_active_subscription', exists (
        select 1 from children ch4
        join child_subscriptions cs4 on cs4.child_id = ch4.id
        where ch4.customer_id = c.id
          and cs4.active = true
          and (cs4.expires_on is null or cs4.expires_on >= current_date)
      ),
      'children', (
        select json_agg(json_build_object(
          'id', ch.id,
          'name', ch.name,
          'age', date_part('year', age(current_date, ch.date_of_birth)),
          'subscription_active', coalesce(cs.active, false),
          'subscription_started_on', cs.started_on,
          'subscription_expires_on', cs.expires_on,
          'plan_name', mp.name,
          'allergies', ch.allergies,
          'medical_conditions', ch.medical_conditions,
          'special_instructions', ch.special_instructions
        ) order by ch.name)
        from children ch
        left join child_subscriptions cs on cs.child_id = ch.id
        left join membership_plans mp on mp.id = cs.plan_id
        where ch.customer_id = c.id
      ),
      'currently_checked_in', exists (
        select 1
        from play_sessions ps
        join children ch2 on ch2.id = ps.child_id
        where ch2.customer_id = c.id and ps.status = 'active'
      )
    ) as row_data
    from customers c
    where
      p_query <> '' and (
        c.name ilike '%' || p_query || '%'
        or c.phone ilike '%' || p_query || '%'
        or exists (
          select 1 from children ch3
          where ch3.customer_id = c.id and ch3.name ilike '%' || p_query || '%'
        )
      )
      and (
        p_plan_id is null or exists (
          select 1 from children ch5
          left join child_subscriptions cs5 on cs5.child_id = ch5.id
          left join child_special_passes csp5 on csp5.child_id = ch5.id and csp5.plan_id = p_plan_id
          where ch5.customer_id = c.id
            and (cs5.plan_id = p_plan_id or csp5.id is not null)
        )
      )
    order by c.name
    limit 20
  ) results;
$$;

grant execute on function staff_search_customers(text, uuid) to authenticated;

create or replace function staff_list_customers(p_limit int default 30, p_plan_id uuid default null)
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data order by last_activity desc), '[]'::json)
  from (
    select
      json_build_object(
        'customer_id', c.id,
        'parent_name', c.name,
        'phone', c.phone,
        'created_at', c.created_at,
        'any_active_subscription', exists (
          select 1 from children ch4
          join child_subscriptions cs4 on cs4.child_id = ch4.id
          where ch4.customer_id = c.id
            and cs4.active = true
            and (cs4.expires_on is null or cs4.expires_on >= current_date)
        ),
        'children', (
          select json_agg(json_build_object(
            'id', ch.id,
            'name', ch.name,
            'age', date_part('year', age(current_date, ch.date_of_birth)),
            'subscription_active', coalesce(cs.active, false),
            'subscription_started_on', cs.started_on,
            'subscription_expires_on', cs.expires_on,
            'plan_name', mp.name,
            'allergies', ch.allergies,
            'medical_conditions', ch.medical_conditions,
            'special_instructions', ch.special_instructions
          ) order by ch.name)
          from children ch
          left join child_subscriptions cs on cs.child_id = ch.id
          left join membership_plans mp on mp.id = cs.plan_id
          where ch.customer_id = c.id
        ),
        'currently_checked_in', exists (
          select 1
          from play_sessions ps
          join children ch2 on ch2.id = ps.child_id
          where ch2.customer_id = c.id and ps.status = 'active'
        )
      ) as row_data,
      greatest(
        c.created_at,
        coalesce((
          select max(ps.start_time) from play_sessions ps
          join children ch5 on ch5.id = ps.child_id
          where ch5.customer_id = c.id
        ), c.created_at)
      ) as last_activity
    from customers c
    where
      p_plan_id is null or exists (
        select 1 from children ch6
        left join child_subscriptions cs6 on cs6.child_id = ch6.id
        left join child_special_passes csp6 on csp6.child_id = ch6.id and csp6.plan_id = p_plan_id
        where ch6.customer_id = c.id
          and (cs6.plan_id = p_plan_id or csp6.id is not null)
      )
    order by last_activity desc
    limit p_limit
  ) results;
$$;

grant execute on function staff_list_customers(int, uuid) to authenticated;