-- =====================================================================
-- Migration 19: per-child subscriptions (fixes the bug where any child
-- in a family was treated as an active member if ANY one of them had a
-- subscription, since membership lived on customers, not children)
-- =====================================================================

-- One row per child, upserted on purchase/renewal — same "unique
-- constraint, upsert on change" pattern already used for shifts.
create table child_subscriptions (
  child_id     uuid primary key references children(id) on delete cascade,
  active       boolean not null default true,
  started_on   date not null default current_date,
  expires_on   date,
  duration_months int,
  updated_at   timestamptz not null default now()
);

alter table child_subscriptions enable row level security;

create policy "staff can read child_subscriptions" on child_subscriptions
  for select to authenticated using (is_staff_member());

create policy "admin can manage child_subscriptions" on child_subscriptions
  for all to authenticated using (is_admin_member()) with check (is_admin_member());

grant select, insert, update, delete on child_subscriptions to authenticated;

-- ---------------------------------------------------------------------
-- Data migration: a family-level subscription didn't record which child
-- it was for, so carry it forward to every child in that family. This is
-- deliberately conservative (nobody loses membership during the
-- upgrade); an admin can then correct it per-child going forward.
-- ---------------------------------------------------------------------
insert into child_subscriptions (child_id, active, started_on, expires_on)
select ch.id, true, coalesce(c.subscription_started_on, current_date), c.subscription_expires_on
from customers c
join children ch on ch.customer_id = c.id
where c.subscription_active = true
on conflict (child_id) do nothing;

-- ---------------------------------------------------------------------
-- Rewritten: now checks child_subscriptions instead of the old
-- customers.subscription_active / subscription_expires_on columns,
-- which are no longer written to as of this migration.
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
    join child_subscriptions cs on cs.child_id = ch.id
    where
      p_query <> ''
      and ch.name ilike '%' || p_query || '%'
      and cs.active = true
      and (cs.expires_on is null or cs.expires_on >= current_date)
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
      )
    ) as row_data
    from children ch
    join customers c on c.id = ch.customer_id
    join child_subscriptions cs on cs.child_id = ch.id
    where cs.active = true
      and (cs.expires_on is null or cs.expires_on >= current_date)
    order by ch.name
    limit 8
  ) results;
$$;

-- Now returns subscription status PER CHILD (nested in the children
-- array) instead of one flag for the whole family, plus a top-level
-- "any_active_subscription" so list/badge views that only care about
-- "is this family a member at all" still work without a schema change
-- on the caller's side.
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
          'subscription_expires_on', cs.expires_on
        ))
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

grant execute on function checkin_search_active_subscribers(text) to authenticated;
grant execute on function checkin_list_active_subscribers() to authenticated;
grant execute on function staff_search_customers(text) to authenticated;

-- ---------------------------------------------------------------------
-- New: a browsable "glimpse" of registered families for the Customers
-- directory, so the list isn't empty until someone starts typing.
-- Ordered by most recent activity (latest visit, falling back to
-- registration date) so the people staff most likely need are on top.
-- ---------------------------------------------------------------------
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
          'subscription_expires_on', cs.expires_on
        ))
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

-- ---------------------------------------------------------------------
-- New: full per-child subscriber list for the Subscriptions tab table
-- (replaces the old direct `customers` table query, which could only
-- ever show one row per family).
-- ---------------------------------------------------------------------
create or replace function admin_list_child_subscriptions()
returns json
language sql
stable
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

grant execute on function admin_list_child_subscriptions() to authenticated;
