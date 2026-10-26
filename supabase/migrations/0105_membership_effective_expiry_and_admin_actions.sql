-- A visit-limited membership is usable only while both its date and visit
-- allowance remain valid. Keep the rule in one immutable helper so directory
-- filters and other SQL read paths can use the same definition.
create or replace function public.child_membership_is_active(
  p_active boolean,
  p_expires_on date,
  p_max_visits int,
  p_visits_used int,
  p_today date
)
returns boolean
language sql
immutable
as $$
  select coalesce(p_active, false)
    and (p_expires_on is null or p_expires_on >= p_today)
    and (p_max_visits is null or coalesce(p_visits_used, 0) < p_max_visits);
$$;

-- Admins can correct an individual child's membership dates without
-- changing the reusable plan. Visit-capped memberships still expire at
-- whichever limit is reached first: the edited end date or the visit cap.
create or replace function public.admin_update_child_membership_dates(
  p_child_id uuid,
  p_started_on date,
  p_expires_on date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if p_child_id is null or p_started_on is null or p_expires_on is null then
    raise exception 'Membership dates are required.' using errcode = 'P0001';
  end if;
  if p_expires_on < p_started_on then
    raise exception 'End date cannot be before the start date.' using errcode = 'P0001';
  end if;

  update public.child_subscriptions
  set started_on = p_started_on,
      expires_on = p_expires_on,
      updated_at = now()
  where child_id = p_child_id;

  if not found then
    raise exception 'This child has no membership to edit.' using errcode = 'P0001';
  end if;

  return json_build_object('success', true);
end;
$$;
revoke all on function public.admin_update_child_membership_dates(uuid, date, date) from public, anon;
grant execute on function public.admin_update_child_membership_dates(uuid, date, date) to authenticated;

-- One atomic edit call for the membership dates and (when visit-limited) its
-- remaining visit allowance. Raising remaining visits above the existing cap
-- grants that many visits by extending the child's snapshotted cap.
create or replace function public.admin_update_child_membership_details(
  p_child_id uuid,
  p_started_on date,
  p_expires_on date,
  p_visits_remaining int default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.child_subscriptions%rowtype;
  v_new_max int;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if p_child_id is null or p_started_on is null or p_expires_on is null then
    raise exception 'Membership dates are required.' using errcode = 'P0001';
  end if;
  if p_expires_on < p_started_on then
    raise exception 'End date cannot be before the start date.' using errcode = 'P0001';
  end if;

  select * into v_sub
  from public.child_subscriptions
  where child_id = p_child_id
  for update;
  if not found then
    raise exception 'This child has no membership to edit.' using errcode = 'P0001';
  end if;
  if p_visits_remaining is not null and v_sub.max_visits is null then
    raise exception 'This membership does not track visit limits.' using errcode = 'P0001';
  end if;
  if p_visits_remaining < 0 then
    raise exception 'Visits remaining cannot be negative.' using errcode = 'P0001';
  end if;

  v_new_max := case when p_visits_remaining is null then v_sub.max_visits
    else greatest(v_sub.max_visits, p_visits_remaining) end;

  update public.child_subscriptions
  set started_on = p_started_on,
      expires_on = p_expires_on,
      max_visits = v_new_max,
      visits_used = case when p_visits_remaining is null then visits_used
        else v_new_max - p_visits_remaining end,
      updated_at = now()
  where child_id = p_child_id;

  return json_build_object('success', true);
end;
$$;
revoke all on function public.admin_update_child_membership_details(uuid, date, date, int) from public, anon;
grant execute on function public.admin_update_child_membership_details(uuid, date, date, int) to authenticated;

-- Admin-only special-day assignment. The pass table already generates a
-- UUID primary key; return that stable identifier for the admin to reference.
create or replace function public.admin_add_child_special_pass(
  p_child_id uuid,
  p_plan_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_date date;
  v_pass_id uuid;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.children where id = p_child_id) then
    raise exception 'Child not found.' using errcode = 'P0001';
  end if;

  select event_date into v_event_date
  from public.membership_plans
  where id = p_plan_id and plan_type = 'special' and active = true;

  if not found then
    raise exception 'Active special-day plan not found.' using errcode = 'P0001';
  end if;
  if v_event_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'This special day has already passed.' using errcode = 'P0001';
  end if;

  insert into public.child_special_passes (child_id, plan_id, event_date)
  values (p_child_id, p_plan_id, v_event_date)
  on conflict (child_id, plan_id) do nothing;

  select id into v_pass_id
  from public.child_special_passes
  where child_id = p_child_id and plan_id = p_plan_id;

  return json_build_object('success', true, 'pass_id', v_pass_id, 'event_date', v_event_date);
end;
$$;
revoke all on function public.admin_add_child_special_pass(uuid, uuid) from public, anon;
grant execute on function public.admin_add_child_special_pass(uuid, uuid) to authenticated;

create or replace function public.admin_membership_status_counts()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'active', count(*) filter (where public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, (now() at time zone 'Asia/Kolkata')::date)),
    'expiring_soon', count(*) filter (
      where public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, (now() at time zone 'Asia/Kolkata')::date)
        and cs.expires_on between (now() at time zone 'Asia/Kolkata')::date and (now() at time zone 'Asia/Kolkata')::date + 7
    )
  )
  from public.child_subscriptions cs
  where is_admin_member();
$$;
revoke all on function public.admin_membership_status_counts() from public, anon;
grant execute on function public.admin_membership_status_counts() to authenticated;

-- Keep the notifications inbox and its compact count consistent with the
-- active-member rule, including memberships exhausted by their visit cap.
-- Migration 0104 changed this function's OUT columns; PostgreSQL requires a
-- drop before its table return type can be replaced.
drop function if exists public.admin_membership_expiry_alerts(text, int, int);

create or replace function public.admin_membership_expiry_alerts(
  p_status text default 'expiring_soon',
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  child_id uuid, child_name text, parent_name text, phone text,
  secondary_phone text, plan_name text, expires_on date, days_remaining int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_admin_member() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_status not in ('expired', 'expiring_soon') then
    raise exception 'Unknown membership expiry filter' using errcode = '22023';
  end if;

  return query
  select ch.id, ch.name, cu.name, cu.phone, cu.secondary_phone, mp.name,
    case when cs.max_visits is not null and cs.visits_used >= cs.max_visits then v_today else cs.expires_on end,
    case when cs.max_visits is not null and cs.visits_used >= cs.max_visits then 0 else (cs.expires_on - v_today)::int end
  from public.child_subscriptions cs
  join public.children ch on ch.id = cs.child_id
  join public.customers cu on cu.id = ch.customer_id
  join public.membership_plans mp on mp.id = cs.plan_id
  where mp.plan_type = 'recurring'
    and (
      (p_status = 'expiring_soon'
        and public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, v_today)
        and cs.expires_on between v_today and v_today + 7)
      or
      (p_status = 'expired'
        and not public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, v_today)
        and (cs.expires_on is not null or cs.max_visits is not null or not cs.active))
    )
  order by
    case when p_status = 'expiring_soon' then cs.expires_on end asc,
    case when p_status = 'expired' then cs.expires_on end desc,
    ch.name asc
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_membership_expiry_alerts(text, int, int) from public, anon;
grant execute on function public.admin_membership_expiry_alerts(text, int, int) to authenticated;

create or replace function public.admin_membership_expiry_alert_counts()
returns table (expiring_soon bigint, expired bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_admin_member() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.child_subscriptions cs
      join public.membership_plans mp on mp.id = cs.plan_id
      where mp.plan_type = 'recurring'
        and public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, v_today)
        and cs.expires_on between v_today and v_today + 7),
    (select count(*) from public.child_subscriptions cs
      join public.membership_plans mp on mp.id = cs.plan_id
      where mp.plan_type = 'recurring'
        and not public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, v_today)
        and (cs.expires_on is not null or cs.max_visits is not null or not cs.active));
end;
$$;
revoke all on function public.admin_membership_expiry_alert_counts() from public, anon;
grant execute on function public.admin_membership_expiry_alert_counts() to authenticated;

-- Directory's existing paged RPC remains the single data read. Exhausted
-- visit plans no longer count as active, even if their calendar expiry is in
-- the future. Special-day passes continue to be independent of memberships.
create or replace function public.directory_browse_customers(
  p_query text default null,
  p_plan_id uuid default null,
  p_members_only boolean default false,
  p_created_since timestamptz default null,
  p_expiring_before date default null,
  p_on_site_first boolean default false,
  p_limit int default 30,
  p_offset int default 0
)
returns json
language sql
stable
as $$
  with params as (
    select nullif(trim(p_query), '') as query_text,
      (now() at time zone 'Asia/Kolkata')::date as venue_today
  ),
  candidates as (
    select c.id, c.name, c.phone, c.secondary_phone, c.created_at,
      exists (
        select 1
        from children ch join child_subscriptions cs on cs.child_id = ch.id
        cross join params p
        where ch.customer_id = c.id
          and public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, p.venue_today)
      ) as has_active_membership,
      exists (
        select 1 from children ch join play_sessions ps on ps.child_id = ch.id
        where ch.customer_id = c.id and ps.status = 'active'
      ) as is_on_site,
      greatest(c.created_at, coalesce((
        select max(ps.start_time) from children ch join play_sessions ps on ps.child_id = ch.id
        where ch.customer_id = c.id
      ), c.created_at)) as last_activity
    from customers c cross join params p
    where
      (p.query_text is null or c.name ilike '%' || p.query_text || '%'
        or c.phone ilike '%' || p.query_text || '%'
        or exists (select 1 from children ch where ch.customer_id = c.id and ch.name ilike '%' || p.query_text || '%'))
      and (p_created_since is null or c.created_at >= p_created_since)
      and (not p_members_only or exists (
        select 1 from children ch join child_subscriptions cs on cs.child_id = ch.id
        where ch.customer_id = c.id
          and public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, p.venue_today)
      ))
      and (p_expiring_before is null or exists (
        select 1 from children ch join child_subscriptions cs on cs.child_id = ch.id
        where ch.customer_id = c.id
          and public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, p.venue_today)
          and cs.expires_on between p.venue_today and p_expiring_before
      ))
      and (p_plan_id is null or exists (
        select 1 from children ch
        left join child_subscriptions cs on cs.child_id = ch.id
        left join child_special_passes csp on csp.child_id = ch.id and csp.plan_id = p_plan_id
        where ch.customer_id = c.id and (cs.plan_id = p_plan_id or csp.id is not null)
      ))
  ),
  page as (
    select c.* from candidates c cross join params p
    order by case when p_on_site_first and c.is_on_site then 0 else 1 end,
      case when p.query_text is not null then c.name end asc nulls last,
      case when p.query_text is null then c.last_activity end desc nulls last, c.id
    limit greatest(1, least(coalesce(p_limit, 30), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(json_agg(json_build_object(
    'customer_id', page.id, 'parent_name', page.name, 'phone', page.phone,
    'secondary_phone', page.secondary_phone, 'created_at', page.created_at,
    'any_active_subscription', page.has_active_membership,
    'currently_checked_in', page.is_on_site,
    'children', (
      select coalesce(json_agg(json_build_object(
        'id', ch.id, 'name', ch.name,
        'age', date_part('year', age(p.venue_today, ch.date_of_birth)),
        'subscription_active', public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, p.venue_today),
        'subscription_started_on', cs.started_on, 'subscription_expires_on', cs.expires_on,
        'plan_name', mp.name, 'max_visits', cs.max_visits, 'visits_used', cs.visits_used,
        'currently_checked_in', active_session.id is not null, 'active_session_id', active_session.id
      ) order by ch.name), '[]'::json)
      from children ch
      left join child_subscriptions cs on cs.child_id = ch.id
      left join membership_plans mp on mp.id = cs.plan_id
      left join lateral (
        select ps.id from play_sessions ps where ps.child_id = ch.id and ps.status = 'active'
        order by ps.start_time desc limit 1
      ) active_session on true
      cross join params p where ch.customer_id = page.id
    )
  ) order by
    case when p_on_site_first and page.is_on_site then 0 else 1 end,
    case when p.query_text is not null then page.name end asc nulls last,
    case when p.query_text is null then page.last_activity end desc nulls last,
    page.id), '[]'::json)
  from page cross join params p;
$$;

-- Expired includes memberships that ran out of visits before their date.
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
  expired_children as (
    select ch.id as child_id, ch.customer_id, ch.name, ch.date_of_birth,
      cs.started_on, cs.expires_on, cs.plan_id, cs.max_visits, cs.visits_used,
      mp.name as plan_name
    from public.children ch
    join public.child_subscriptions cs on cs.child_id = ch.id
    left join public.membership_plans mp on mp.id = cs.plan_id
    cross join params p
    where not public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, p.venue_today)
      and (cs.expires_on is not null or cs.max_visits is not null or not cs.active)
  ),
  customer_matches as (
    select cu.id, cu.name, cu.phone, cu.secondary_phone, cu.created_at
    from public.customers cu cross join params p
    where (p.query_text is null or cu.name ilike '%' || p.query_text || '%'
      or cu.phone ilike '%' || p.query_text || '%'
      or exists (select 1 from public.children qch where qch.customer_id = cu.id and qch.name ilike '%' || p.query_text || '%'))
      and exists (select 1 from expired_children ec where ec.customer_id = cu.id)
  ),
  page as (
    select cm.* from customer_matches cm order by cm.name, cm.id
    limit greatest(1, least(coalesce(p_limit, 30), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(json_agg(json_build_object(
    'customer_id', page.id, 'parent_name', page.name, 'phone', page.phone,
    'secondary_phone', page.secondary_phone, 'created_at', page.created_at,
    'any_active_subscription', false,
    'currently_checked_in', exists(select 1 from public.children lc join public.play_sessions ps on ps.child_id = lc.id and ps.status = 'active' where lc.customer_id = page.id),
    'children', (
      select coalesce(json_agg(json_build_object(
        'id', ec.child_id, 'name', ec.name,
        'age', date_part('year', age(p.venue_today, ec.date_of_birth)),
        'subscription_active', false, 'subscription_started_on', ec.started_on,
        'subscription_expires_on', ec.expires_on, 'plan_name', ec.plan_name,
        'plan_id', ec.plan_id,
        'max_visits', ec.max_visits, 'visits_used', ec.visits_used,
        'special_plan_ids', coalesce((select json_agg(csp.plan_id order by csp.event_date, csp.plan_id) from public.child_special_passes csp where csp.child_id = ec.child_id), '[]'::json),
        'currently_checked_in', active_session.id is not null,
        'active_session_id', active_session.id
      ) order by ec.name), '[]'::json)
      from expired_children ec cross join params p
      left join lateral (
        select ps.id from public.play_sessions ps
        where ps.child_id = ec.child_id and ps.status = 'active'
        order by ps.start_time desc limit 1
      ) active_session on true
      where ec.customer_id = page.id
    )
  ) order by page.name, page.id), '[]'::json)
  from page cross join params p;
$$;

revoke all on function public.directory_browse_expired_customers_with_plans(text, int, int) from public, anon;
grant execute on function public.directory_browse_expired_customers_with_plans(text, int, int) to authenticated;

-- Do not offer exhausted/date-expired memberships in the staff check-in
-- chooser. Today's special-day pass remains a valid independent route in.
create or replace function public.checkin_search_active_subscribers(p_query text)
returns json
language sql
stable
as $$
  with params as (select (now() at time zone 'Asia/Kolkata')::date as venue_today)
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'child_id', ch.id, 'child_name', ch.name,
      'age', date_part('year', age(p.venue_today, ch.date_of_birth)),
      'customer_id', cu.id, 'parent_name', cu.name, 'phone_last4', right(cu.phone, 4),
      'currently_checked_in', exists(select 1 from public.play_sessions ps where ps.child_id = ch.id and ps.status = 'active'),
      'active_session_id', (select ps.id from public.play_sessions ps where ps.child_id = ch.id and ps.status = 'active' limit 1),
      'is_special_today', exists(select 1 from public.child_special_passes csp where csp.child_id = ch.id and csp.event_date = p.venue_today),
      'special_attended_today', exists(select 1 from public.child_special_passes csp join public.play_sessions ps2 on ps2.special_pass_id = csp.id where csp.child_id = ch.id and csp.event_date = p.venue_today),
      'max_visits', cs.max_visits, 'visits_used', cs.visits_used
    ) as row_data
    from public.children ch
    join public.customers cu on cu.id = ch.customer_id
    left join public.child_subscriptions cs on cs.child_id = ch.id
    cross join params p
    where coalesce(p_query, '') <> '' and ch.name ilike '%' || p_query || '%'
      and (
        public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, p.venue_today)
        or exists(select 1 from public.child_special_passes csp where csp.child_id = ch.id and csp.event_date = p.venue_today)
      )
    order by ch.name limit 20
  ) results;
$$;
grant execute on function public.checkin_search_active_subscribers(text) to authenticated;

create or replace function public.checkin_list_active_subscribers()
returns json
language sql
stable
as $$
  with params as (select (now() at time zone 'Asia/Kolkata')::date as venue_today)
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'child_id', ch.id, 'child_name', ch.name,
      'age', date_part('year', age(p.venue_today, ch.date_of_birth)),
      'customer_id', cu.id, 'parent_name', cu.name, 'phone_last4', right(cu.phone, 4),
      'currently_checked_in', exists(select 1 from public.play_sessions ps where ps.child_id = ch.id and ps.status = 'active'),
      'active_session_id', (select ps.id from public.play_sessions ps where ps.child_id = ch.id and ps.status = 'active' limit 1),
      'is_special_today', exists(select 1 from public.child_special_passes csp where csp.child_id = ch.id and csp.event_date = p.venue_today),
      'special_attended_today', exists(select 1 from public.child_special_passes csp join public.play_sessions ps2 on ps2.special_pass_id = csp.id where csp.child_id = ch.id and csp.event_date = p.venue_today),
      'max_visits', cs.max_visits, 'visits_used', cs.visits_used
    ) as row_data
    from public.children ch
    join public.customers cu on cu.id = ch.customer_id
    left join public.child_subscriptions cs on cs.child_id = ch.id
    cross join params p
    where public.child_membership_is_active(cs.active, cs.expires_on, cs.max_visits, cs.visits_used, p.venue_today)
      or exists(select 1 from public.child_special_passes csp where csp.child_id = ch.id and csp.event_date = p.venue_today)
    order by exists(select 1 from public.child_special_passes csp where csp.child_id = ch.id and csp.event_date = p.venue_today) desc, ch.name
    limit 12
  ) results;
$$;
grant execute on function public.checkin_list_active_subscribers() to authenticated;

notify pgrst, 'reload schema';
