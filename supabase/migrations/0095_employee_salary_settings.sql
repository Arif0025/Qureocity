-- Admin-managed per-employee salary rates for the staff roster.
-- NULL means the employee's salary has not been configured yet.
alter table employees
  add column if not exists salary_type text,
  add column if not exists salary_rate numeric(12, 2);

alter table employees
  drop constraint if exists employees_salary_type_check,
  add constraint employees_salary_type_check
    check (salary_type is null or salary_type in ('monthly', 'hourly')),
  drop constraint if exists employees_salary_rate_check,
  add constraint employees_salary_rate_check
    check (salary_rate is null or salary_rate >= 0);
