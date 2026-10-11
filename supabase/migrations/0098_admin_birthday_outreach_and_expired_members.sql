-- Admin birthday outreach and a focused, paged directory view for expired plans.
-- Birthday matching uses an indexed month/day key, so it does not fetch all
-- children into the browser or calculate birthday ranges client-side.

create index if not exists idx_children_birthday_month_day
  on public.children (((extract(month from date_of_birth)::int * 100) + extract(day from date_of_birth)::int))
  where date_of_birth is not null;

create index if not exists idx_child_subscriptions_child_expiry
  on public.child_subscriptions (child_id, expires_on desc)
  where expires_on is not null;

create or replace function public.admin_upcoming_child_birthdays(
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  child_id uuid,
  child_name text,
  date_of_birth date,
  birthday_on date,
  days_until int,
  parent_name text,
  phone text,
  secondary_phone text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_end date := (now() at time zone 'Asia/Kolkata')::date + 30;
  v_start_key int;
  v_end_key int;
begin
  if not is_admin_member() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  v_start_key := extract(month from v_today)::int * 100 + extract(day from v_today)::int;
  v_end_key := extract(month from v_end)::int * 100 + extract(day from v_end)::int;

  return query
  with matches as (
    select ch.id as matched_child_id,
      ch.name as matched_child_name,
      ch.date_of_birth as matched_dob,
      cu.name as matched_parent_name,
      cu.phone as matched_phone,
      cu.secondary_phone as matched_secondary_phone,
      dates.birthday_date
    from public.children ch
    join public.customers cu on cu.id = ch.customer_id
    cross join lateral (
      select min(candidate) as birthday_date
      from (
        select make_date(year_value, extract(month from ch.date_of_birth)::int, 1)
          + least(
              extract(day from ch.date_of_birth)::int,
              extract(day from (make_date(year_value, extract(month from ch.date_of_birth)::int, 1) + interval '1 month - 1 day'))::int
            ) - 1 as candidate
        from (values (extract(year from v_today)::int), (extract(year from v_today)::int + 1)) years(year_value)
      ) possible
      where candidate between v_today and v_end
    ) dates
    where ch.date_of_birth is not null
      and (
        (v_start_key <= v_end_key and
          (extract(month from ch.date_of_birth)::int * 100 + extract(day from ch.date_of_birth)::int) between v_start_key and v_end_key)
        or
        (v_start_key > v_end_key and (
          (extract(month from ch.date_of_birth)::int * 100 + extract(day from ch.date_of_birth)::int) >= v_start_key
          or (extract(month from ch.date_of_birth)::int * 100 + extract(day from ch.date_of_birth)::int) <= v_end_key
        ))
      )
  )
  select m.matched_child_id,
    m.matched_child_name,
    m.matched_dob,
    m.birthday_date,
    (m.birthday_date - v_today)::int,
    m.matched_parent_name,
    m.matched_phone,
    m.matched_secondary_phone
  from matches m
  order by m.birthday_date, m.matched_child_name
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_upcoming_child_birthdays(int, int) from public, anon;
grant execute on function public.admin_upcoming_child_birthdays(int, int) to authenticated;

-- This returns the same compact row shape consumed by CustomerSearch, but
-- only returns children whose latest membership is expired and who have no
-- currently valid membership. Pagination happens in SQL before JSON output.
create or replace function public.directory_browse_expired_customers_with_plans(
  p_query text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns json
language sql
stable
set search_path = public
as $$
  with params as (
    select nullif(trim(p_query), '') as query_text,
      (now() at time zone 'Asia/Kolkata')::date as venue_today
  ),
  customer_matches as (
    select cu.id, cu.name, cu.phone, cu.secondary_phone, cu.created_at
    from public.customers cu
    cross join params p
    where (p.query_text is null or cu.name ilike '%' || p.query_text || '%'
      or cu.phone ilike '%' || p.query_text || '%'
      or exists (select 1 from public.children qch where qch.customer_id = cu.id and qch.name ilike '%' || p.query_text || '%'))
      and exists (
        select 1
        from public.children ch
        join lateral (
          select cs.expires_on
          from public.child_subscriptions cs
          where cs.child_id = ch.id and cs.expires_on is not null
          order by cs.started_on desc nulls last, cs.expires_on desc
          limit 1
        ) latest on true
        where ch.customer_id = cu.id
          and latest.expires_on < p.venue_today
          and not exists (
            select 1 from public.child_subscriptions current_sub
            where current_sub.child_id = ch.id and current_sub.active = true
              and (current_sub.expires_on is null or current_sub.expires_on >= p.venue_today)
          )
      )
  ),
  page as (
    select cm.* from customer_matches cm
    order by cm.name, cm.id
    limit greatest(1, least(coalesce(p_limit, 30), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(json_agg(json_build_object(
    'customer_id', page.id,
    'parent_name', page.name,
    'phone', page.phone,
    'secondary_phone', page.secondary_phone,
    'created_at', page.created_at,
    'any_active_subscription', false,
    'currently_checked_in', exists(select 1 from public.children live_child join public.play_sessions ps on ps.child_id = live_child.id and ps.status = 'active' where live_child.customer_id = page.id),
    'children', (
      select coalesce(json_agg(json_build_object(
        'id', ch.id,
        'name', ch.name,
        'age', date_part('year', age(p.venue_today, ch.date_of_birth)),
        'subscription_active', false,
        'subscription_started_on', latest.started_on,
        'subscription_expires_on', latest.expires_on,
        'plan_name', mp.name,
        'max_visits', latest.max_visits,
        'visits_used', latest.visits_used,
        'currently_checked_in', active_session.id is not null,
        'active_session_id', active_session.id
      ) order by ch.name), '[]'::json)
      from public.children ch
      cross join params p
      join lateral (
        select cs.started_on, cs.expires_on, cs.plan_id, cs.max_visits, cs.visits_used
        from public.child_subscriptions cs
        where cs.child_id = ch.id and cs.expires_on is not null
        order by cs.started_on desc nulls last, cs.expires_on desc
        limit 1
      ) latest on latest.expires_on < p.venue_today
      left join public.membership_plans mp on mp.id = latest.plan_id
      left join lateral (
        select ps.id from public.play_sessions ps
        where ps.child_id = ch.id and ps.status = 'active'
        order by ps.start_time desc limit 1
      ) active_session on true
      where ch.customer_id = page.id
        and not exists (
          select 1 from public.child_subscriptions current_sub
          where current_sub.child_id = ch.id and current_sub.active = true
            and (current_sub.expires_on is null or current_sub.expires_on >= p.venue_today)
        )
    )
  ) order by page.name, page.id), '[]'::json)
  from page;
$$;

revoke all on function public.directory_browse_expired_customers_with_plans(text, int, int) from public, anon;
grant execute on function public.directory_browse_expired_customers_with_plans(text, int, int) to authenticated;

notify pgrst, 'reload schema';
