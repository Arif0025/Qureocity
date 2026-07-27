-- =====================================================================
-- Migration 10: shifts redesign — standing assignment, not per-date
-- =====================================================================
-- Migration 9 modeled shifts as one row per (employee, date) — meaning
-- an admin would need to re-assign every single day. What's actually
-- wanted: one shift per employee that just stays in effect until an
-- admin changes it. This drops the date dimension and makes employee_id
-- unique, so "assigning a shift" becomes an upsert onto that employee's
-- one row instead of appending a new row.

alter table shifts drop column if exists shift_date;

-- Safe to run even if migration 9 was never applied and this table
-- doesn't exist yet in that shape — guards make this idempotent either way.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shifts_employee_id_key'
  ) then
    alter table shifts add constraint shifts_employee_id_key unique (employee_id);
  end if;
end $$;