-- =====================================================================
-- Migration 50: check kids in directly from the Directory
-- =====================================================================
-- staff_list_customers / staff_search_customers only knew whether a
-- CUSTOMER had someone checked in, not which specific child — not
-- enough to show a per-child Check in / Check out action. Adding
-- currently_checked_in + active_session_id to each child, same shape
-- checkin_search_active_subscribers already returns, so the Directory
-- can drive check-in/out with the same checkin_create_sessions /
-- checkout_session RPCs Quick Check-In already uses.
-- =====================================================================

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
          'special_instructions', ch.special_instructions,
          'currently_checked_in', exists (
            select 1 from play_sessions ps where ps.child_id = ch.id and ps.status = 'active'
          ),
          'active_session_id', (
            select ps.id from play_sessions ps
            where ps.child_id = ch.id and ps.status = 'active'
            limit 1
          )
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
            'special_instructions', ch.special_instructions,
            'currently_checked_in', exists (
              select 1 from play_sessions ps where ps.child_id = ch.id and ps.status = 'active'
            ),
            'active_session_id', (
              select ps.id from play_sessions ps
              where ps.child_id = ch.id and ps.status = 'active'
              limit 1
            )
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