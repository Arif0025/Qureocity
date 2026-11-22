-- Tune the most expensive app-owned RPCs from the current query report.

-- Keep the active dashboard feed ordered by session start and make the
-- confirmed-receipt lookup in the plan roster an indexed top-1 lookup.
create index if not exists idx_play_sessions_active_start_time
  on public.play_sessions(start_time)
  where status = 'active';

create index if not exists idx_membership_registrations_confirmed_child_receipt
  on public.membership_registrations
    (child_id, reviewed_at desc nulls last, submitted_at desc)
  where status = 'confirmed';

-- Inline visit classification into one scan of play_sessions. The previous
-- SQL called checkin_visit_type(ps.id) for every matching session, which
-- can cause a second lookup of play_sessions per row.
create or replace function public.checkin_daily_counts_by_type(p_days int default 28)
returns table(day date, visit_type text, cnt bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    (ps.start_time at time zone 'Asia/Kolkata')::date as day,
    case
      when ps.special_pass_id is not null then 'special'
      when cs.child_id is not null
        and cs.started_on <= (ps.start_time at time zone 'Asia/Kolkata')::date
        and (cs.expires_on is null or cs.expires_on >= (ps.start_time at time zone 'Asia/Kolkata')::date)
        then 'membership'
      else 'walk_in'
    end as visit_type,
    count(*)::bigint as cnt
  from public.play_sessions ps
  left join public.child_subscriptions cs on cs.child_id = ps.child_id
  where ps.start_time >= now() - p_days * interval '1 day'
    and ps.status in ('active', 'completed', 'expired')
  group by 1, 2
  order by 1;
$$;

create or replace function public.checkin_type_summary(
  p_since timestamptz,
  p_until timestamptz default now()
)
returns table(visit_type text, cnt bigint, unique_children bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    case
      when ps.special_pass_id is not null then 'special'
      when cs.child_id is not null
        and cs.started_on <= (ps.start_time at time zone 'Asia/Kolkata')::date
        and (cs.expires_on is null or cs.expires_on >= (ps.start_time at time zone 'Asia/Kolkata')::date)
        then 'membership'
      else 'walk_in'
    end as visit_type,
    count(*)::bigint as cnt,
    count(distinct ps.child_id)::bigint as unique_children
  from public.play_sessions ps
  left join public.child_subscriptions cs on cs.child_id = ps.child_id
  where ps.start_time >= p_since
    and ps.start_time < p_until
    and ps.status in ('active', 'completed', 'expired')
  group by 1;
$$;

-- Use the timestamp column for aggregate ordering instead of extracting a
-- text value from the JSON payload. This also lets the planner consider the
-- partial start-time index above for the active-session feed.
create or replace function public.dashboard_list_checked_in_kids()
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(json_agg(row_data order by session_start_time), '[]'::json)
  from (
    select
      json_build_object(
        'session_id', ps.id,
        'child_id', ch.id,
        'child_name', ch.name,
        'age', date_part('year', age(current_date, ch.date_of_birth)),
        'start_time', ps.start_time,
        'end_time', ps.end_time,
        'status', ps.status,
        'parent_name', c.name,
        'phone', c.phone,
        'has_medical_info',
          nullif(trim(ch.allergies), '') is not null
          or nullif(trim(ch.medical_conditions), '') is not null
          or nullif(trim(ch.special_instructions), '') is not null,
        'visit_type', case
          when ps.special_pass_id is not null then 'special'
          when cs.started_on <= (ps.start_time at time zone 'Asia/Kolkata')::date
            and (cs.expires_on is null or cs.expires_on >= (ps.start_time at time zone 'Asia/Kolkata')::date)
            then 'membership'
          else 'walk_in'
        end,
        'plan_name', case when ps.special_pass_id is not null then smp.name else mp.name end,
        'membership_started_on', case when ps.special_pass_id is null then cs.started_on end,
        'membership_expires_on', case when ps.special_pass_id is null then cs.expires_on end,
        'is_membership_expired', ps.special_pass_id is null
          and cs.expires_on is not null
          and cs.expires_on < (ps.start_time at time zone 'Asia/Kolkata')::date,
        'is_special_today', ps.special_pass_id is not null,
        'special_plan_name', smp.name
      ) as row_data,
      ps.start_time as session_start_time
    from public.play_sessions ps
    join public.children ch on ch.id = ps.child_id
    join public.customers c on c.id = ch.customer_id
    left join public.child_subscriptions cs on cs.child_id = ch.id
    left join public.membership_plans mp on mp.id = cs.plan_id
    left join public.child_special_passes csp on csp.id = ps.special_pass_id
    left join public.membership_plans smp on smp.id = csp.plan_id
    where ps.status = 'active'
  ) active_sessions;
$$;

grant execute on function public.dashboard_list_checked_in_kids() to authenticated;

-- Internal SECURITY DEFINER helper used by registration RPCs, not a direct
-- PostgREST endpoint.
revoke all on function public.special_pass_is_open(uuid, uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
