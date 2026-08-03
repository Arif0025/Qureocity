-- =====================================================================
-- Migration 21: let admin_staff_attendance_summary filter to a single
-- employee, for the employee-facing self-service "My Performance" view
-- (the admin Staff tab still calls it with no argument to get everyone).
-- =====================================================================

-- Adding a parameter creates a NEW overload rather than replacing the
-- migration-20 version, since Postgres resolves functions by their full
-- argument list. Left in place, a zero-argument call would become
-- ambiguous between the two (both have all-default parameters) —
-- so the old one-argument version must be dropped first.
drop function if exists admin_staff_attendance_summary(date);

create or replace function admin_staff_attendance_summary(
  p_month_start date default date_trunc('month', current_date)::date,
  p_employee_id uuid default null
)
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data order by (row_data->>'employee_name')), '[]'::json)
  from (
    select json_build_object(
      'employee_id', e.id,
      'employee_name', e.name,
      'role', e.role,
      'actual_working_days', (
        select count(distinct date(al.punch_in))
        from attendance_logs al
        where al.employee_id = e.id
          and al.punch_in >= p_month_start
          and al.punch_in < p_month_start + interval '1 month'
      ),
      'total_hours_this_month', (
        select coalesce(
          round((sum(extract(epoch from (coalesce(al.punch_out, now()) - al.punch_in))) / 3600)::numeric, 1),
          0
        )
        from attendance_logs al
        where al.employee_id = e.id
          and al.punch_in >= p_month_start
          and al.punch_in < p_month_start + interval '1 month'
      )
    ) as row_data
    from employees e
    where p_employee_id is null or e.id = p_employee_id
  ) results;
$$;

grant execute on function admin_staff_attendance_summary(date, uuid) to authenticated;
