-- Keep only the most recent 24 hours of employee/admin inbox notifications.
-- Delete existing older rows immediately, then continue hourly cleanup.
delete from public.employee_notifications
where created_at < now() - interval '1 day';

do $$
begin
  perform cron.schedule(
    'employee-inbox-retention',
    '0 * * * *',
    $job$delete from public.employee_notifications where created_at < now() - interval '1 day';$job$
  );
exception when others then
  raise notice 'Could not update employee inbox cleanup (%). If pg_cron is enabled, schedule employee_notifications retention manually.', sqlerrm;
end $$;
