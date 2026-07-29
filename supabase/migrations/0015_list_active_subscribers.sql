-- Small, bounded list used by the quick check-in screen. It returns the
-- same safe fields as the name-search function, only for active members.
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
    where c.subscription_active = true
      and (c.subscription_expires_on is null or c.subscription_expires_on >= current_date)
    order by ch.name
    limit 8
  ) results;
$$;

grant execute on function checkin_list_active_subscribers() to authenticated;
