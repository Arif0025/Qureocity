-- =====================================================================
-- Migration 43: payment status on special-day passes
-- =====================================================================
-- The problem: staff often can't collect/confirm payment at the moment
-- they're processing a special-day sign-up (kiosk self-service, a
-- promo-link registration submitted from home, cash to be paid at the
-- door, etc.) — but the child still needs to be registered and show up
-- in Quick Check-In on the day. So confirming a special-day
-- registration no longer implies payment was received; it just means
-- the booking itself is accepted. Payment is tracked separately on
-- child_special_passes and can be flagged paid at any point after
-- (front desk, day-of check-in, etc.) without re-touching the
-- registration record.
-- =====================================================================

alter table child_special_passes
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid'));

-- Every new special-day pass starts unpaid — this is the actual "we
-- can't confirm payment yet but need them registered" behavior.
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
    insert into child_special_passes (child_id, plan_id, event_date, payment_status)
    values (p_child_id, p_plan_id, v_plan.event_date, 'pending')
    on conflict (child_id, plan_id) do update set event_date = excluded.event_date;
    -- Note: deliberately NOT resetting payment_status on conflict — if a
    -- pass somehow gets re-applied (shouldn't normally happen since
    -- submit_membership_renewal blocks duplicates), an already-paid
    -- pass shouldn't silently flip back to pending.
  else
    v_expires_on := current_date + (
      case v_plan.validity_unit
        when 'weeks' then (v_plan.validity_value * 7 || ' days')::interval
        else (v_plan.validity_value || ' months')::interval
      end
    );
    insert into child_subscriptions (child_id, active, started_on, expires_on, duration_months, plan_id)
    values (
      p_child_id, true, current_date, v_expires_on,
      case when v_plan.validity_unit = 'months' then v_plan.validity_value else null end,
      p_plan_id
    )
    on conflict (child_id) do update set
      active = true,
      started_on = current_date,
      expires_on = v_expires_on,
      duration_months = excluded.duration_months,
      plan_id = excluded.plan_id,
      updated_at = now();
  end if;
end;
$$;

-- Admin-only toggle, used from the plan roster in the Plans tab.
create or replace function admin_set_special_pass_payment_status(
  p_pass_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if p_status not in ('pending', 'paid') then
    raise exception 'Invalid payment status.' using errcode = 'P0001';
  end if;

  update child_special_passes set payment_status = p_status where id = p_pass_id;
end;
$$;

grant execute on function admin_set_special_pass_payment_status(uuid, text) to authenticated;

-- Surface payment_status in the plan roster (Plans tab)...
create or replace function admin_list_plan_members()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_data order by (row_data->>'plan_name')), '[]'::json)
  from (
    select json_build_object(
      'plan_id', p.id,
      'plan_name', p.name,
      'plan_type', p.plan_type,
      'event_date', p.event_date,
      'price', p.price,
      'active', p.active,
      'member_count',
        case when p.plan_type = 'special'
          then coalesce(json_array_length(sm.members), 0)
          else coalesce(json_array_length(rm.members), 0)
        end,
      'members',
        case when p.plan_type = 'special'
          then coalesce(sm.members, '[]'::json)
          else coalesce(rm.members, '[]'::json)
        end
    ) as row_data
    from membership_plans p
    left join lateral (
      select json_agg(json_build_object(
               'child_id', ch.id,
               'child_name', ch.name,
               'age', date_part('year', age(current_date, ch.date_of_birth)),
               'parent_name', c.name,
               'phone', c.phone,
               'started_on', cs.started_on,
               'expires_on', cs.expires_on,
               'currently_active', cs.active and (cs.expires_on is null or cs.expires_on >= current_date)
             ) order by ch.name) as members
      from child_subscriptions cs
      join children ch on ch.id = cs.child_id
      join customers c on c.id = ch.customer_id
      where cs.plan_id = p.id
    ) rm on true
    left join lateral (
      select json_agg(json_build_object(
               'pass_id', csp.id,
               'child_id', ch.id,
               'child_name', ch.name,
               'age', date_part('year', age(current_date, ch.date_of_birth)),
               'parent_name', c.name,
               'phone', c.phone,
               'event_date', csp.event_date,
               'purchased_at', csp.purchased_at,
               'payment_status', csp.payment_status
             ) order by ch.name) as members
      from child_special_passes csp
      join children ch on ch.id = csp.child_id
      join customers c on c.id = ch.customer_id
      where csp.plan_id = p.id
    ) sm on true
  ) results;
$$;

grant execute on function admin_list_plan_members() to authenticated;

-- ...and in Quick Check-In, so staff know to collect payment at the door.
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
      ),
      'special_payment_pending', exists(
        select 1 from child_special_passes csp
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
          and csp.payment_status = 'pending'
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
      ),
      'special_payment_pending', exists(
        select 1 from child_special_passes csp
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
          and csp.payment_status = 'pending'
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