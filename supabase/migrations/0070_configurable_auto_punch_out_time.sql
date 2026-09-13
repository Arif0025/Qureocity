-- =====================================================================
-- Migration 70: configurable auto punch-out time
-- =====================================================================
-- The daily safety cutoff that force-closes anyone still punched in was
-- hardcoded to 21:30 IST (migrations 0016/0027). Admin now gets to pick
-- that time, same admin-editable pattern as
-- attendance_variance_threshold_mins added in 0027.
--
-- Note: the actual write only happens when the Vercel Hobby cron fires
-- (once a day, ~21:30 IST per vercel.json). Picking a cutoff LATER than
-- that run time means the close won't actually land until the next
-- day's run — the frontend surfaces this caveat next to the setting.
-- =====================================================================

alter table app_settings
  add column if not exists auto_punch_out_time time not null default '21:30';

create or replace function auto_punch_out_open_attendance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
  v_cutoff_time time;
begin
  select auto_punch_out_time into v_cutoff_time from app_settings where id = true;
  v_cutoff_time := coalesce(v_cutoff_time, '21:30'::time);

  update attendance_logs al
  set punch_out = (
        date(al.punch_in at time zone 'Asia/Kolkata') + v_cutoff_time
      ) at time zone 'Asia/Kolkata',
      auto_punched_out = true
  where al.punch_out is null
    and al.punch_in < (
      date(al.punch_in at time zone 'Asia/Kolkata') + v_cutoff_time
    ) at time zone 'Asia/Kolkata'
    and (
      date(al.punch_in at time zone 'Asia/Kolkata') + v_cutoff_time
    ) at time zone 'Asia/Kolkata' <= now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

notify pgrst, 'reload schema';