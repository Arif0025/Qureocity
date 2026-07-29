-- A completed record must say whether the system closed it, so the admin
-- dashboard can distinguish a normal checkout from the daily safety cutoff.
alter table attendance_logs
  add column if not exists auto_punched_out boolean not null default false;

create or replace function auto_punch_out_open_attendance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_start timestamptz;
  v_cutoff timestamptz;
  v_rows integer;
begin
  -- The venue operates in India time. Compute one precise 21:30 cutoff and
  -- store that cutoff, not the cron's run time, so reported hours never grow
  -- beyond 9:30 PM if a cron invocation runs a few seconds late.
  v_today_start := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_cutoff := ((now() at time zone 'Asia/Kolkata')::date + time '21:30') at time zone 'Asia/Kolkata';

  update attendance_logs
  set punch_out = v_cutoff,
      auto_punched_out = true
  where punch_out is null
    and punch_in >= v_today_start
    and punch_in <= v_cutoff;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

grant execute on function auto_punch_out_open_attendance() to service_role;
