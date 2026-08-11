-- =====================================================================
-- Migration 33: fix ORDER BY bug + birthday broadcast filter
-- =====================================================================
-- Part A: staff_list_customers referenced `row_data->>'last_activity'`
-- in ORDER BY, where row_data was a json blob built inside the same
-- SELECT list — nesting the sort key inside the JSON payload like that
-- is what triggered "column row_data does not exist". Fixed by hoisting
-- last_activity out as its own plain column, sorted on directly, with
-- the json blob built around it instead of containing it.
-- =====================================================================

create or replace function staff_list_customers(p_limit int default 30)
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
    order by last_activity desc
    limit p_limit
  ) results;
$$;

grant execute on function staff_list_customers(int) to authenticated;

-- ---------------------------------------------------------------------
-- Part B: birthday-proximity filter for the WhatsApp broadcast tool.
-- Compares month+day only (ignores birth year), wrapping around the
-- year boundary so e.g. Dec 28 counts as "within 7 days" of Jan 2.
-- ---------------------------------------------------------------------
create or replace function broadcast_candidates(
  p_subscription_status text default null,
  p_expiring_within_days int default null,
  p_visit_recency text default null,
  p_visit_recency_days int default null,
  p_min_age int default null,
  p_max_age int default null,
  p_min_visits int default null,
  p_max_visits int default null,
  p_birthday_within_days int default null
)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      cu.id as customer_id,
      cu.name as parent_name,
      cu.phone,
      ch.id as child_id,
      ch.name as child_name,
      ch.date_of_birth,
      date_part('year', age(current_date, ch.date_of_birth))::int as age,
      cs.active as subscription_active,
      cs.expires_on as subscription_expires_on,
      (select max(ps.start_time) from play_sessions ps where ps.child_id = ch.id)::date as last_visit_date,
      (select count(*) from play_sessions ps where ps.child_id = ch.id) as visit_count,
      -- Days until this year's (or next year's, if already passed)
      -- birthday, comparing month+day only.
      least(
        (make_date(
          extract(year from current_date)::int,
          extract(month from ch.date_of_birth)::int,
          extract(day from ch.date_of_birth)::int
        ) - current_date),
        (make_date(
          extract(year from current_date)::int + 1,
          extract(month from ch.date_of_birth)::int,
          extract(day from ch.date_of_birth)::int
        ) - current_date)
      ) as days_until_birthday
    from customers cu
    join children ch on ch.customer_id = cu.id
    left join child_subscriptions cs on cs.child_id = ch.id
  )
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'customer_id', b.customer_id,
      'parent_name', b.parent_name,
      'phone', b.phone,
      'child_id', b.child_id,
      'child_name', b.child_name,
      'age', b.age,
      'subscription_active', coalesce(b.subscription_active, false),
      'subscription_expires_on', b.subscription_expires_on,
      'last_visit_date', b.last_visit_date,
      'visit_count', b.visit_count,
      'days_until_birthday', b.days_until_birthday
    ) as row_data
    from base b
    where
      (p_subscription_status is null or (
        case p_subscription_status
          when 'active' then
            b.subscription_active = true
            and (b.subscription_expires_on is null or b.subscription_expires_on >= current_date)
          when 'expired' then
            b.subscription_active = true
            and b.subscription_expires_on is not null
            and b.subscription_expires_on < current_date
          when 'expiring_soon' then
            b.subscription_active = true
            and b.subscription_expires_on is not null
            and b.subscription_expires_on >= current_date
            and b.subscription_expires_on <= current_date + coalesce(p_expiring_within_days, 7)
          when 'never' then
            b.subscription_active is null
          else true
        end
      ))
      and (p_visit_recency is null or (
        case p_visit_recency
          when 'no_visit_in' then
            b.last_visit_date is null
            or b.last_visit_date < current_date - coalesce(p_visit_recency_days, 30)
          when 'visited_in' then
            b.last_visit_date is not null
            and b.last_visit_date >= current_date - coalesce(p_visit_recency_days, 30)
          else true
        end
      ))
      and (p_min_age is null or b.age >= p_min_age)
      and (p_max_age is null or b.age <= p_max_age)
      and (p_min_visits is null or b.visit_count >= p_min_visits)
      and (p_max_visits is null or b.visit_count <= p_max_visits)
      and (p_birthday_within_days is null or b.days_until_birthday <= p_birthday_within_days)
  ) results;
$$;

grant execute on function broadcast_candidates(text, int, text, int, int, int, int, int, int) to authenticated;