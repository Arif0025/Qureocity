-- =====================================================================
-- Migration 26: WhatsApp broadcast — combinable filter RPC
-- =====================================================================
-- Returns one row per (customer, child) pair so subscription/age fields
-- are always unambiguous for message placeholders. A customer with two
-- matching children shows as two rows — intentional, since {child_name}
-- and {expiry_date} are child-specific and the admin sends one message
-- per row anyway (wa.me only supports one chat at a time).
--
-- All filters are optional and ANDed together when provided, which is
-- what gives the "combinations" behavior (e.g. expiring in 7 days AND
-- no visit in 14 days) without needing a generic query builder.
-- =====================================================================

create or replace function broadcast_candidates(
  p_subscription_status text default null,  -- 'active' | 'expired' | 'expiring_soon' | 'never'
  p_expiring_within_days int default null,  -- used with 'expiring_soon'
  p_visit_recency text default null,        -- 'no_visit_in' | 'visited_in'
  p_visit_recency_days int default null,
  p_min_age int default null,
  p_max_age int default null,
  p_min_visits int default null,
  p_max_visits int default null
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
      date_part('year', age(current_date, ch.date_of_birth))::int as age,
      cs.active as subscription_active,
      cs.expires_on as subscription_expires_on,
      (select max(ps.start_time) from play_sessions ps where ps.child_id = ch.id)::date as last_visit_date,
      (select count(*) from play_sessions ps where ps.child_id = ch.id) as visit_count
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
      'visit_count', b.visit_count
    ) as row_data
    from base b
    where
      -- subscription status
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
      -- visit recency
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
      -- age range
      and (p_min_age is null or b.age >= p_min_age)
      and (p_max_age is null or b.age <= p_max_age)
      -- visit frequency
      and (p_min_visits is null or b.visit_count >= p_min_visits)
      and (p_max_visits is null or b.visit_count <= p_max_visits)
  ) results;
$$;

grant execute on function broadcast_candidates(text, int, text, int, int, int, int, int) to authenticated;