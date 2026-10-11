-- A single, paged read path for the admin Directory. Existing staff_* RPCs
-- remain intact for Global Search and other screens that depend on them.
create or replace function directory_browse_customers(
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
    select
      c.id,
      c.name,
      c.phone,
      c.secondary_phone,
      c.created_at,
      exists (
        select 1
        from children ch
        join child_subscriptions cs on cs.child_id = ch.id
        cross join params p
        where ch.customer_id = c.id
          and cs.active = true
          and (cs.expires_on is null or cs.expires_on >= p.venue_today)
      ) as has_active_membership,
      exists (
        select 1
        from children ch
        join play_sessions ps on ps.child_id = ch.id
        where ch.customer_id = c.id and ps.status = 'active'
      ) as is_on_site,
      greatest(
        c.created_at,
        coalesce((
          select max(ps.start_time)
          from children ch
          join play_sessions ps on ps.child_id = ch.id
          where ch.customer_id = c.id
        ), c.created_at)
      ) as last_activity
    from customers c
    cross join params p
    where
      (p.query_text is null or
        c.name ilike '%' || p.query_text || '%' or
        c.phone ilike '%' || p.query_text || '%' or
        exists (
          select 1 from children ch
          where ch.customer_id = c.id
            and ch.name ilike '%' || p.query_text || '%'
        ))
      and (p_created_since is null or c.created_at >= p_created_since)
      and (not p_members_only or exists (
        select 1
        from children ch
        join child_subscriptions cs on cs.child_id = ch.id
        where ch.customer_id = c.id
          and cs.active = true
          and (cs.expires_on is null or cs.expires_on >= p.venue_today)
      ))
      and (p_expiring_before is null or exists (
        select 1
        from children ch
        join child_subscriptions cs on cs.child_id = ch.id
        where ch.customer_id = c.id
          and cs.active = true
          and cs.expires_on >= p.venue_today
          and cs.expires_on <= p_expiring_before
      ))
      and (p_plan_id is null or exists (
        select 1
        from children ch
        left join child_subscriptions cs on cs.child_id = ch.id
        left join child_special_passes csp
          on csp.child_id = ch.id and csp.plan_id = p_plan_id
        where ch.customer_id = c.id
          and (cs.plan_id = p_plan_id or csp.id is not null)
      ))
  ),
  page as (
    select c.*
    from candidates c
    cross join params p
    order by
      case when p_on_site_first and c.is_on_site then 0 else 1 end,
      case when p.query_text is not null then c.name end asc nulls last,
      case when p.query_text is null then c.last_activity end desc nulls last,
      c.id
    limit greatest(1, least(coalesce(p_limit, 30), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(json_agg(json_build_object(
    'customer_id', page.id,
    'parent_name', page.name,
    'phone', page.phone,
    'secondary_phone', page.secondary_phone,
    'created_at', page.created_at,
    'any_active_subscription', page.has_active_membership,
    'currently_checked_in', page.is_on_site,
    'children', (
      select coalesce(json_agg(json_build_object(
        'id', ch.id,
        'name', ch.name,
        'age', date_part('year', age(p.venue_today, ch.date_of_birth)),
        'subscription_active', coalesce(cs.active, false),
        'subscription_started_on', cs.started_on,
        'subscription_expires_on', cs.expires_on,
        'plan_name', mp.name,
        'max_visits', cs.max_visits,
        'visits_used', cs.visits_used,
        'currently_checked_in', active_session.id is not null,
        'active_session_id', active_session.id
      ) order by ch.name), '[]'::json)
      from children ch
      left join child_subscriptions cs on cs.child_id = ch.id
      left join membership_plans mp on mp.id = cs.plan_id
      left join lateral (
        select ps.id
        from play_sessions ps
        where ps.child_id = ch.id and ps.status = 'active'
        order by ps.start_time desc
        limit 1
      ) active_session on true
      cross join params p
      where ch.customer_id = page.id
    )
  ) order by
    case when p_on_site_first and page.is_on_site then 0 else 1 end,
    case when p.query_text is not null then page.name end asc nulls last,
    case when p.query_text is null then page.last_activity end desc nulls last,
    page.id), '[]'::json)
  from page
  cross join params p;
$$;

grant execute on function directory_browse_customers(text, uuid, boolean, timestamptz, date, boolean, int, int) to authenticated;

-- Health and address details are returned only after a child row is opened.
create or replace function directory_child_details(p_customer_id uuid, p_child_id uuid)
returns json
language sql
stable
as $$
  select json_build_object(
    'date_of_birth', ch.date_of_birth,
    'address', c.address,
    'allergies', ch.allergies,
    'medical_conditions', ch.medical_conditions,
    'special_instructions', ch.special_instructions
  )
  from children ch
  join customers c on c.id = ch.customer_id
  where ch.customer_id = p_customer_id and ch.id = p_child_id;
$$;

grant execute on function directory_child_details(uuid, uuid) to authenticated;

-- Supports the activity ordering used by the browse list and active-child
-- lookup without scanning all sessions for each child.
create index if not exists idx_play_sessions_child_start_time
  on play_sessions(child_id, start_time desc);

notify pgrst, 'reload schema';
