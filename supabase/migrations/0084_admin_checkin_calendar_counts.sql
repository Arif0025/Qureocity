-- Fetch one visible calendar month of daily totals only when an admin
-- opens Check-in activity or navigates to another month.
create or replace function admin_checkin_calendar_counts(p_month date)
returns table(day date, cnt bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := date_trunc('month', p_month::timestamp) at time zone 'Asia/Kolkata';
  v_until timestamptz := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'Asia/Kolkata';
begin
  if not is_admin_member() then
    raise exception 'Only admins can view check-in activity.' using errcode = 'P0001';
  end if;

  return query
    select (ps.start_time at time zone 'Asia/Kolkata')::date as day,
           count(*)::bigint as cnt
    from play_sessions ps
    where ps.start_time >= v_from
      and ps.start_time < v_until
      and ps.status in ('active', 'completed', 'expired')
    group by 1
    order by 1;
end;
$$;

revoke all on function admin_checkin_calendar_counts(date) from public, anon;
grant execute on function admin_checkin_calendar_counts(date) to authenticated;

-- The calendar RPC reads an indexed, month-bounded range.
create index if not exists idx_play_sessions_checkin_calendar
  on play_sessions(start_time)
  where status in ('active', 'completed', 'expired');

notify pgrst, 'reload schema';
