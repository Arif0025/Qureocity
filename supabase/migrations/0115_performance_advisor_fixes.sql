-- Address advisor findings: index uncovered foreign keys and make common
-- authenticated RLS expressions statement-stable for better query plans.

-- Foreign key indexes do not change row semantics and help joins as well as
-- parent deletes/updates that need to find referencing rows.
create index if not exists child_special_passes_plan_id_idx
  on public.child_special_passes(plan_id);
create index if not exists child_subscriptions_plan_id_idx
  on public.child_subscriptions(plan_id);
create index if not exists employee_leave_requests_reviewed_by_idx
  on public.employee_leave_requests(reviewed_by);
create index if not exists membership_registrations_child_id_idx
  on public.membership_registrations(child_id);
create index if not exists membership_registrations_customer_id_idx
  on public.membership_registrations(customer_id);
create index if not exists membership_registrations_plan_id_idx
  on public.membership_registrations(plan_id);
create index if not exists membership_registrations_renewal_child_id_idx
  on public.membership_registrations(renewal_child_id);
create index if not exists membership_registrations_renewal_customer_id_idx
  on public.membership_registrations(renewal_customer_id);
create index if not exists membership_registrations_reviewed_by_idx
  on public.membership_registrations(reviewed_by);
create index if not exists message_templates_updated_by_idx
  on public.message_templates(updated_by);
create index if not exists notification_preferences_event_type_idx
  on public.notification_preferences(event_type);
create index if not exists notification_rules_updated_by_idx
  on public.notification_rules(updated_by);
create index if not exists party_bookings_party_plan_id_idx
  on public.party_bookings(party_plan_id);
-- reviewed_by exists on the live database reported by the advisor but is not
-- present in every checked-in schema history, so guard the index for fresh
-- installs that have not added that optional review attribution column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'party_bookings'
      and column_name = 'reviewed_by'
  ) then
    create index if not exists party_bookings_reviewed_by_idx
      on public.party_bookings(reviewed_by);
  end if;
end;
$$;

-- Keep the rate limit table's intentionally simple bucket/time index while
-- giving the table a stable row identity for tooling and maintenance.
alter table public.checkin_rate_limit
  add column if not exists id uuid not null default gen_random_uuid();
alter table public.checkin_rate_limit
  add constraint checkin_rate_limit_pkey primary key (id);

-- Cache auth.uid() once per statement rather than evaluating it per row.
drop policy if exists "staff can punch themselves in" on public.attendance_logs;
create policy "staff can punch themselves in" on public.attendance_logs
  for insert to authenticated
  with check (employee_id = (select auth.uid()));

drop policy if exists "staff can close their own open punch" on public.attendance_logs;
create policy "staff can close their own open punch" on public.attendance_logs
  for update to authenticated
  using (employee_id = (select auth.uid()))
  with check (employee_id = (select auth.uid()));

drop policy if exists "staff can read own employee row, admin reads all" on public.employees;
create policy "staff can read own employee row, admin reads all" on public.employees
  for select to authenticated
  using (id = (select auth.uid()) or is_admin_member());

drop policy if exists "employee can read own shifts, admin reads all" on public.shifts;
create policy "employee can read own shifts, admin reads all" on public.shifts
  for select to authenticated
  using (employee_id = (select auth.uid()) or is_admin_member());

drop policy if exists "employees read own notifications" on public.employee_notifications;
create policy "employees read own notifications" on public.employee_notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Consolidate SELECT access into one policy per role/action while preserving
-- the existing staff/admin access rules.
drop policy if exists "staff can read special passes" on public.child_special_passes;
drop policy if exists "admin can manage special passes" on public.child_special_passes;
create policy "staff and admins can read special passes" on public.child_special_passes
  for select to authenticated using (is_staff_member() or is_admin_member());
create policy "admins can insert special passes" on public.child_special_passes
  for insert to authenticated with check (is_admin_member());
create policy "admins can update special passes" on public.child_special_passes
  for update to authenticated using (is_admin_member()) with check (is_admin_member());
create policy "admins can delete special passes" on public.child_special_passes
  for delete to authenticated using (is_admin_member());

drop policy if exists "staff can read child_subscriptions" on public.child_subscriptions;
drop policy if exists "admin can manage child_subscriptions" on public.child_subscriptions;
create policy "staff and admins can read child_subscriptions" on public.child_subscriptions
  for select to authenticated using (is_staff_member() or is_admin_member());
create policy "admins can insert child_subscriptions" on public.child_subscriptions
  for insert to authenticated with check (is_admin_member());
create policy "admins can update child_subscriptions" on public.child_subscriptions
  for update to authenticated using (is_admin_member()) with check (is_admin_member());
create policy "admins can delete child_subscriptions" on public.child_subscriptions
  for delete to authenticated using (is_admin_member());

drop policy if exists "admins read leave requests" on public.employee_leave_requests;
drop policy if exists "employees read own leave requests" on public.employee_leave_requests;
create policy "admins and employees read leave requests" on public.employee_leave_requests
  for select to authenticated
  using (is_admin_member() or employee_id = (select auth.uid()));

-- Anonymous users still see active plans; authenticated admins see all plans
-- through one SELECT policy, avoiding duplicate permissive policies.
drop policy if exists "anyone can read active plans" on public.membership_plans;
drop policy if exists "admins can read all plans" on public.membership_plans;
create policy "anyone can read active plans" on public.membership_plans
  for select to anon using (active = true);
create policy "authenticated users can read active plans and admins all plans" on public.membership_plans
  for select to authenticated using (active = true or is_admin_member());

drop policy if exists "staff can read message templates" on public.message_templates;
drop policy if exists "admins can manage message templates" on public.message_templates;
create policy "staff and admins can read message templates" on public.message_templates
  for select to authenticated using (is_staff_member() or is_admin_member());
create policy "admins can insert message templates" on public.message_templates
  for insert to authenticated with check (is_admin_member());
create policy "admins can update message templates" on public.message_templates
  for update to authenticated using (is_admin_member()) with check (is_admin_member());
create policy "admins can delete message templates" on public.message_templates
  for delete to authenticated using (is_admin_member());
