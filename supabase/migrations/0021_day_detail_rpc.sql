-- =====================================================================
-- Migration 18: single-day detail RPC for the Home "check-in activity"
-- calendar drill-down (who checked in + who was on shift that day)
-- =====================================================================
-- Not SECURITY DEFINER — relies on the caller's own staff-read RLS on
-- play_sessions / children / customers / attendance_logs / employees,
-- same posture as the other analytics RPCs in migration 7.

create or replace function admin_day_detail(p_day date)
returns json
language sql
stable
as $$
  select json_build_object(
    'checkins', coalesce((
      select json_agg(row_data order by (row_data->>'checked_in_at'))
      from (
        select json_build_object(
          'child_name', ch.name,
          'parent_name', cu.name,
          'parent_phone', cu.phone,
          'checked_in_at', ps.start_time,
          'checked_out_at', coalesce(ps.ended_at, ps.end_time),
          'status', ps.status::text
        ) as row_data
        from play_sessions ps
        join children ch on ch.id = ps.child_id
        join customers cu on cu.id = ch.customer_id
        where date(ps.start_time) = p_day
      ) sub
    ), '[]'::json),
    'staff', coalesce((
      select json_agg(row_data order by (row_data->>'punch_in'))
      from (
        select json_build_object(
          'employee_name', e.name,
          'punch_in', al.punch_in,
          'punch_out', al.punch_out,
          'auto_punched_out', al.auto_punched_out
        ) as row_data
        from attendance_logs al
        join employees e on e.id = al.employee_id
        where date(al.punch_in) = p_day
      ) sub
    ), '[]'::json)
  );
$$;

grant execute on function admin_day_detail(date) to authenticated;
