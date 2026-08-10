-- =====================================================================
-- Migration 32: CustomerSearch improvements
-- =====================================================================
-- Part A: customer_visit_history gets an optional p_child_id filter —
-- previously it always returned every child's visits merged together,
-- so a parent with multiple kids had no way to see just one child's
-- history.
--
-- Part B: staff_search_customers / staff_list_customers now include
-- medical fields per child, so the search tab can show the same
-- allergy/condition flag used everywhere else in the app.
-- =====================================================================

create or replace function customer_visit_history(
  p_customer_id uuid,
  p_child_id uuid default null
)
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'child_name', ch.name,
      'checked_in_at', ps.start_time,
      'checked_out_at', coalesce(ps.ended_at, ps.end_time),
      'status', ps.status::text,
      'visit_day', date(ps.start_time),
      'intended_duration_mins', ps.duration_mins,
      'actual_duration_mins', case
        when ps.ended_at is not null then greatest(
          0,
          floor(extract(epoch from (ps.ended_at - ps.start_time)) / 60)::int
        )
        when ps.end_time is not null then greatest(
          0,
          floor(extract(epoch from (ps.end_time - ps.start_time)) / 60)::int
        )
        else null
      end
    ) as row_data
    from play_sessions ps
    join children ch on ch.id = ps.child_id
    where ch.customer_id = p_customer_id
      and (p_child_id is null or ch.id = p_child_id)
    order by ps.start_time desc
    limit 50
  ) results;
$$;

grant execute on function customer_visit_history(uuid, uuid) to authenticated;

create or replace function staff_search_customers(p_query text)
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
          'allergies', ch.allergies,
          'medical_conditions', ch.medical_conditions,
          'special_instructions', ch.special_instructions
        ) order by ch.name)
        from children ch
        left join child_subscriptions cs on cs.child_id = ch.id
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
    order by c.name
    limit 20
  ) results;
$$;

grant execute on function staff_search_customers(text) to authenticated;

create or replace function staff_list_customers(p_limit int default 30)
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
          'allergies', ch.allergies,
          'medical_conditions', ch.medical_conditions,
          'special_instructions', ch.special_instructions
        ) order by ch.name)
        from children ch
        left join child_subscriptions cs on cs.child_id = ch.id
        where ch.customer_id = c.id
      ),
      'currently_checked_in', exists (
        select 1
        from play_sessions ps
        join children ch2 on ch2.id = ps.child_id
        where ch2.customer_id = c.id and ps.status = 'active'
      ),
      'last_activity', greatest(
        c.created_at,
        coalesce((
          select max(ps.start_time) from play_sessions ps
          join children ch5 on ch5.id = ps.child_id
          where ch5.customer_id = c.id
        ), c.created_at)
      )
    ) as row_data
    from customers c
    order by row_data->>'last_activity' desc
    limit p_limit
  ) results;
$$;

grant execute on function staff_list_customers(int) to authenticated;