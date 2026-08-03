-- =====================================================================
-- Migration 20: per-employee monthly attendance summary for the
-- redesigned Staff tab roster (total hours worked this month, and
-- actual vs total working days).
-- =====================================================================
-- Deliberately its own RPC rather than reusing the site-wide
-- attendance_logs feed the dashboard already fetches (limited to the
-- 200 most recent rows across ALL employees) — that limit is fine for
-- a live "who's on duty" glimpse, but would silently under-count a
-- busy employee's monthly hours once enough other staff have punched
-- in/out. This aggregates properly in SQL over the real month range.

create or replace function admin_staff_attendance_summary(
  p_month_start date default date_trunc('month', current_date)::date
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
  ) results;
$$;

grant execute on function admin_staff_attendance_summary(date) to authenticated;
