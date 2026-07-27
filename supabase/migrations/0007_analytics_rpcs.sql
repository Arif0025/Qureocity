-- =====================================================================
-- Migration 7: analytics RPCs (age breakdown + daily activity)
-- =====================================================================
-- PostgREST doesn't support GROUP BY through the regular REST query
-- builder, so these aggregations are plain SQL functions instead.
-- Not SECURITY DEFINER — relies on the caller's own "staff can read
-- sessions" RLS, same as any other authenticated read.

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
  ) sub
  group by bucket;
$$;

grant execute on function checkin_age_buckets(timestamptz) to authenticated;

create or replace function checkin_daily_counts(p_days int default 70)
returns table(day date, cnt bigint)
language sql
stable
as $$
  select date_trunc('day', start_time)::date as day, count(*) as cnt
  from play_sessions
  where start_time >= now() - (p_days || ' days')::interval
  group by day
  order by day;
$$;

grant execute on function checkin_daily_counts(int) to authenticated;
