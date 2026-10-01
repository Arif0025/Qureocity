-- =====================================================================
-- Migration 73: check-in type breakdown for analytics
-- =====================================================================
-- checkin_daily_counts and checkin_age_buckets (0007, revised in 0020 and
-- 0034) only ever reported a single combined total. This adds the same
-- confirmed-only counting (active/completed/expired) split three ways:
--
--   'special'    — covered by a same-day special-event pass
--                   (play_sessions.special_pass_id is set)
--   'membership' — covered by a recurring plan active on the visit's
--                   IST calendar date
--   'walk_in'    — neither: a one-off paid visit
--
-- There's no separate RPC for "membership check-in" vs "walk-in" — both
-- go through the same checkin_create_sessions (0046/0071), so the type
-- has to be derived here from child_subscriptions/child_special_passes
-- rather than read off the session row directly. child_subscriptions is
-- a single current row per child (not a history table), so a visit is
-- classified against whatever plan window is on file now — a visit made
-- under a since-replaced plan can't be reconstructed exactly. Fine for
-- a trend view; not a billing record.
-- =====================================================================

create or replace function checkin_visit_type(p_session_id uuid)
returns text
language sql
stable
as $$
  select case
    when ps.special_pass_id is not null then 'special'
    when exists (
      select 1 from child_subscriptions cs
      where cs.child_id = ps.child_id
        and cs.started_on <= (ps.start_time at time zone 'Asia/Kolkata')::date
        and (
          cs.expires_on is null
          or cs.expires_on >= (ps.start_time at time zone 'Asia/Kolkata')::date
        )
    ) then 'membership'
    else 'walk_in'
  end
  from play_sessions ps
  where ps.id = p_session_id;
$$;

create or replace function checkin_daily_counts_by_type(p_days int default 28)
returns table(day date, visit_type text, cnt bigint)
language sql
stable
as $$
  select
    (ps.start_time at time zone 'Asia/Kolkata')::date as day,
    checkin_visit_type(ps.id) as visit_type,
    count(*) as cnt
  from play_sessions ps
  where ps.start_time >= now() - (p_days || ' days')::interval
    and ps.status in ('active', 'completed', 'expired')
  group by day, visit_type
  order by day;
$$;

grant execute on function checkin_daily_counts_by_type(int) to authenticated;

create or replace function checkin_type_summary(
  p_since timestamptz,
  p_until timestamptz default now()
)
returns table(visit_type text, cnt bigint, unique_children bigint)
language sql
stable
as $$
  select
    checkin_visit_type(ps.id) as visit_type,
    count(*) as cnt,
    count(distinct ps.child_id) as unique_children
  from play_sessions ps
  where ps.start_time >= p_since
    and ps.start_time < p_until
    and ps.status in ('active', 'completed', 'expired')
  group by visit_type;
$$;

grant execute on function checkin_type_summary(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';