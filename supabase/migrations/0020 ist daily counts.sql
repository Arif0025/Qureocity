-- =====================================================================
-- Migration 20: IST-aware daily bucketing for the heatmap
-- =====================================================================
-- Previously bucketed by the database's default timezone (UTC), which
-- only happened to roughly line up with real IST business days by
-- coincidence of typical operating hours. Making this explicit avoids
-- relying on that coincidence — same pattern already used correctly in
-- auto_punch_out_open_attendance (migration 16).

create or replace function checkin_daily_counts(p_days int default 70)
returns table(day date, cnt bigint)
language sql
stable
as $$
  select (start_time at time zone 'Asia/Kolkata')::date as day, count(*) as cnt
  from play_sessions
  where start_time >= now() - (p_days || ' days')::interval
  group by day
  order by day;
$$; 