-- =====================================================================
-- Migration 13: monthly subscriptions + quick check-in by name
-- =====================================================================

alter table customers add column if not exists subscription_active boolean not null default false;
alter table customers add column if not exists subscription_expires_on date;

-- Only admins can toggle/edit subscription status.
create policy "admin can update customers" on customers
  for update to authenticated using (is_admin_member());

grant update on customers to authenticated;

-- ---------------------------------------------------------------------
-- Quick check-in search: employees search by CHILD NAME instead of
-- phone number, but only ever see children whose family currently has
-- an active, non-expired subscription — this is the deliberate
-- precaution requested: staff can't check in a walk-in just because a
-- name happens to match, only genuine active members surface here at
-- all. Returns enough context (parent name + last 4 digits of phone) to
-- tell apart two children who share a first name.
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
      )
    ) as row_data
    from children ch
    join customers c on c.id = ch.customer_id
    where
      p_query <> ''
      and ch.name ilike '%' || p_query || '%'
      and c.subscription_active = true
      and (c.subscription_expires_on is null or c.subscription_expires_on >= current_date)
    order by ch.name
    limit 20
  ) results;
$$;

grant execute on function checkin_search_active_subscribers(text) to authenticated;

-- Re-created to also surface subscription status in the general staff
-- search (migration 11), so admins can see + manage it from there.
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
      'subscription_active', c.subscription_active,
      'subscription_expires_on', c.subscription_expires_on,
      'children', (
        select json_agg(json_build_object(
          'id', ch.id,
          'name', ch.name,
          'age', date_part('year', age(current_date, ch.date_of_birth))
        ))
        from children ch where ch.customer_id = c.id
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