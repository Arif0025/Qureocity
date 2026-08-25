-- =====================================================================
-- Migration 34: confirmed-only check-in analytics
-- =====================================================================
-- checkin_daily_counts (the home heatmap) and checkin_age_buckets both
-- counted every play_sessions row with no status filter, so a session
-- sitting in pending_payment — created the moment a parent submits the
-- kiosk form, before any staff member confirms it — was already being
-- counted. A row that gets discarded (never confirmed, abandoned) also
-- stayed counted forever. Both RPCs now only count sessions that were
-- actually confirmed to have happened: active, completed, or expired.
-- =====================================================================

create or replace function checkin_daily_counts(p_days int default 70)
returns table(day date, cnt bigint)
language sql
stable
as $$
  select (start_time at time zone 'Asia/Kolkata')::date as day, count(*) as cnt
  from play_sessions
  where start_time >= now() - (p_days || ' days')::interval
    and status in ('active', 'completed', 'expired')
  group by day
  order by day;
$$;

create or replace function checkin_age_buckets(p_since timestamptz)
returns table(bucket text, cnt bigint)
language sql
stable
as $$
  select
    case
      when age_years <= 3 then '0-3'
      when age_years <= 6 then '4-6'
      when age_years <= 9 then '7-9'
      when age_years <= 12 then '10-12'
      else '13+'
    end as bucket,
    count(*) as cnt
  from (
    select date_part('year', age(current_date, c.date_of_birth))::int as age_years
    from play_sessions ps
    join children c on c.id = ps.child_id
    where ps.start_time >= p_since
      and ps.status in ('active', 'completed', 'expired')
  ) sub
  group by bucket;
$$;