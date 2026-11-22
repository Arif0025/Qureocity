alter table employees add column if not exists phone text;

create table if not exists employee_salary_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  salary_type text not null check (salary_type in ('monthly', 'hourly')),
  salary_rate numeric(12, 2) not null check (salary_rate >= 0),
  effective_at timestamptz not null default now(),
  changed_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists employee_salary_history_employee_effective_idx
  on employee_salary_history (employee_id, effective_at desc);

insert into employee_salary_history (employee_id, salary_type, salary_rate, effective_at)
select id, salary_type, salary_rate, now()
from employees
where salary_type in ('monthly', 'hourly') and salary_rate is not null;

create or replace function record_employee_salary_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.salary_type in ('monthly', 'hourly') and new.salary_rate is not null
    and (tg_op = 'INSERT' or new.salary_type is distinct from old.salary_type
      or new.salary_rate is distinct from old.salary_rate) then
    insert into employee_salary_history (employee_id, salary_type, salary_rate, changed_by)
    values (new.id, new.salary_type, new.salary_rate, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists employees_record_salary_change on employees;
create trigger employees_record_salary_change
  after insert or update of salary_type, salary_rate on employees
  for each row execute function record_employee_salary_change();

alter table employee_salary_history enable row level security;
