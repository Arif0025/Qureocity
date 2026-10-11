-- Shorten inbox history to two days and run cleanup hourly. Re-scheduling
-- the same job name updates installs that already applied migration 0093.
do $$
begin
  perform cron.schedule(
    'employee-inbox-retention',
    '0 * * * *',
    $job$delete from public.employee_notifications where created_at < now() - interval '2 days';$job$
  );
exception when others then
  raise notice 'Could not update employee inbox cleanup (%). If pg_cron is enabled, schedule employee_notifications retention manually.', sqlerrm;
end $$;
