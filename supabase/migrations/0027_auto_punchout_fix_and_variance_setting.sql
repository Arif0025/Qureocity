-- =====================================================================
-- Migration 27: auto punch-out cron fix + configurable OT/UT threshold
-- =====================================================================
-- Part A: auto_punch_out_open_attendance() only ever looked at rows
-- whose punch_in fell on "today" (relative to when the cron runs). If a
-- cron run is ever missed (Vercel Hobby cron has no delivery guarantee),
-- that day's leftover open row falls permanently outside every future
-- run's window — the next run only checks *its own* day. Fixed by
-- keying each row to its own day's 21:30 IST cutoff instead of "today",
-- so a stale row from any previous day still gets caught.
--
-- Part B: attendance_variance_threshold_mins on app_settings — the
-- "worked > shift by this much = overtime, worked < shift by this much
-- = undertime" threshold, admin-editable instead of hardcoded, since it
-- was hardcoded at 30 min in the app before this.
-- =====================================================================

create or replace function auto_punch_out_open_attendance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  update attendance_logs al
  set punch_out = (
        date(al.punch_in at time zone 'Asia/Kolkata') + time '21:30'
      ) at time zone 'Asia/Kolkata',
      auto_punched_out = true
  where al.punch_out is null
    and al.punch_in < (
      date(al.punch_in at time zone 'Asia/Kolkata') + time '21:30'
    ) at time zone 'Asia/Kolkata'
    and (
      date(al.punch_in at time zone 'Asia/Kolkata') + time '21:30'
    ) at time zone 'Asia/Kolkata' <= now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

alter table app_settings
  add column if not exists attendance_variance_threshold_mins integer not null default 30;