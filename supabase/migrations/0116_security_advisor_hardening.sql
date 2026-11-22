-- Pin search_path on functions flagged by the database security advisor.
-- Include all current overloads of each reported routine.
do $$
declare
  fn record;
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'push_endpoint_fingerprint', 'staff_list_customers', 'check_rate_limit',
        'checkout_session', 'expire_overdue_sessions', 'checkin_age_buckets',
        'prune_used_qr_tokens', 'checkin_daily_counts', 'enforce_child_limit',
        'prune_rate_limit', 'compute_play_session_end_time',
        'staff_list_checked_in_children', 'staff_get_customer_overview',
        'directory_child_details', 'next_receipt_number',
        'child_membership_is_active', 'customer_visit_history',
        'checkin_visit_type', 'staff_search_customers',
        'checkin_daily_counts_by_type', 'directory_browse_customers_with_plans',
        'checkin_type_summary', 'directory_browse_customers',
        'checkin_search_active_subscribers', 'checkin_list_active_subscribers'
      ])
  loop
    execute format('alter function %I.%I(%s) set search_path = public, pg_temp',
      fn.nspname, fn.proname, fn.args);
  end loop;
end;
$$;

-- Admin RPCs are for signed-in application users. Remove the default PUBLIC
-- EXECUTE grant that also makes SECURITY DEFINER routines callable as anon.
-- Keep authenticated and service_role access for the app and trusted server.
do $$
declare
  fn record;
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname like 'admin\_%' escape '\'
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon',
      fn.nspname, fn.proname, fn.args);
    execute format('grant execute on function %I.%I(%s) to authenticated, service_role',
      fn.nspname, fn.proname, fn.args);
  end loop;
end;
$$;

-- These SECURITY DEFINER routines support authenticated staff/admin screens
-- or are internal helpers; none is an anonymous kiosk endpoint.
do $$
declare
  fn record;
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (array[
        'broadcast_candidates', 'confirm_membership_registration',
        'confirm_pending_session', 'dashboard_list_checked_in_kids',
        'dashboard_list_team_today', 'discard_membership_registration',
        'discard_pending_session', 'list_pending_registrations',
        'list_pending_sessions', 'special_pass_is_open'
      ])
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon',
      fn.nspname, fn.proname, fn.args);
    execute format('grant execute on function %I.%I(%s) to authenticated, service_role',
      fn.nspname, fn.proname, fn.args);
  end loop;
end;
$$;

-- These SECURITY DEFINER functions are called by other routines, triggers,
-- or scheduled jobs. They are not direct PostgREST client endpoints.
do $$
declare
  fn record;
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (array[
        'apply_plan_to_child', 'auto_punch_out_open_attendance',
        'next_special_receipt', 'rls_auto_enable',
        'sync_special_registration_date', 'trg_employee_leave_submitted'
      ])
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon, authenticated',
      fn.nspname, fn.proname, fn.args);
  end loop;
end;
$$;

-- expire_overdue_sessions is called by the trusted cron route/service role.
revoke all on function public.expire_overdue_sessions() from public, anon, authenticated;
grant execute on function public.expire_overdue_sessions() to service_role;

-- The tables below intentionally have no client policies. Their migrations
-- revoke direct client privileges and route access through narrowly scoped
-- SECURITY DEFINER RPCs or the service role, so RLS default-deny is desired.
