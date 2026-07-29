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
    ) as row_data
    from customers c
    where p_query <> '' and (
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
