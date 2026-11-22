-- Limit session push checks to venue operating days/hours and reduce their
-- frequency from once per minute to once every five minutes. The venue is
-- closed on Tuesdays per the leave policy, so these jobs skip Tuesday.
-- pg_cron is configured for GMT (UTC): 11:30-21:00 Asia/Kolkata is 06:00-15:30 UTC.
do $$
begin
  perform cron.schedule(
    'push-session-ending',
    '*/5 6-14 * * 0-1,3-6',
    $job$
      select public.push_notify_sessions_ending();
      select public.push_notify_sessions_overdue();
    $job$
  );

  -- Cron syntax cannot express the partial final hour in one expression.
  perform cron.schedule(
    'push-session-ending-late-window',
    '0,5,10,15,20,25,30 15 * * 0-1,3-6',
    $job$
      select public.push_notify_sessions_ending();
      select public.push_notify_sessions_overdue();
    $job$
  );

  -- Nightly cleanup at 23:30 IST (18:00 UTC).
  perform cron.schedule(
    'push-housekeeping',
    '30 18 * * *',
    $job$
      delete from public.notification_log where created_at < now() - interval '14 days';
      delete from public.push_send_log where created_at < now() - interval '30 days';
      delete from cron.job_run_details where end_time < now() - interval '3 days';
    $job$
  );

  -- Keep the one-day age threshold, but run the inbox cleanup once nightly.
  perform cron.schedule(
    'employee-inbox-retention',
    '30 18 * * *',
    $job$delete from public.employee_notifications where created_at < now() - interval '1 day';$job$
  );
end $$;
