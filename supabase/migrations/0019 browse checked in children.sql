-- =====================================================================
-- Migration 19: browse-all-checked-in-children view for Search
-- =====================================================================

-- Small cards for the default (no query typed yet) Search view: every
-- child who has at least one play_sessions row, regardless of status.
create or replace function staff_list_checked_in_children()
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'child_id', ch.id,
      'child_name', ch.name,
      'customer_id', c.id,
      'parent_name', c.name
    ) as row_data
    from children ch
    join customers c on c.id = ch.customer_id
    where exists (select 1 from play_sessions ps where ps.child_id = ch.id)
    order by ch.name
    limit 60
  ) results;
$$;

grant execute on function staff_list_checked_in_children() to authenticated;

-- Fetching one customer's full card by id — used when a browse-card is
-- clicked, so duplicate child names never cause the wrong family to be
-- shown (unlike re-running a text search on the name, which could match
-- more than one child).
create or replace function staff_get_customer_overview(p_customer_id uuid)
returns json
language sql
stable
as $$
  select json_build_object(
    'customer_id', c.id,
    'parent_name', c.name,
    'phone', c.phone,
    'subscription_active', c.subscription_active,
    'subscription_started_on', c.subscription_started_on,
    'subscription_expires_on', c.subscription_expires_on,
    'children', (
      select json_agg(json_build_object(
        'id', ch.id,
        'name', ch.name,
        'age', date_part('year', age(current_date, ch.date_of_birth)),
        'date_of_birth', ch.date_of_birth
      ) order by ch.name)
      from children ch where ch.customer_id = c.id
    ),
    'currently_checked_in', exists (
      select 1 from play_sessions ps
      join children ch2 on ch2.id = ps.child_id
      where ch2.customer_id = c.id and ps.status = 'active'
    )
  )
  from customers c
  where c.id = p_customer_id;
$$;

grant execute on function staff_get_customer_overview(uuid) to authenticated;