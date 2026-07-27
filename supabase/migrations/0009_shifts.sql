-- =====================================================================
-- Migration 9: shifts
-- =====================================================================
create table shifts (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  shift_date  date not null,
  start_time  time not null,
  end_time    time not null,
  notes       text,
  created_at  timestamptz not null default now(),
  constraint shift_end_after_start check (end_time > start_time)
);
 
create index idx_shifts_employee_date on shifts(employee_id, shift_date);
 
alter table shifts enable row level security;
 
-- Employees see only their own shifts; admins see everyone's.
create policy "employee can read own shifts, admin reads all" on shifts
  for select to authenticated using (
    employee_id = auth.uid() or is_admin_member()
  );
 
-- Only admins can assign/edit/remove shifts.
create policy "admin can insert shifts" on shifts
  for insert to authenticated with check (is_admin_member());
 
create policy "admin can update shifts" on shifts
  for update to authenticated using (is_admin_member());
 
create policy "admin can delete shifts" on shifts
  for delete to authenticated using (is_admin_member());
 
grant select, insert, update, delete on shifts to authenticated;