-- Migration 10 changed shifts from dated rows to one standing row per employee,
-- but dashboard_list_team_on_day still joined against the removed shift_date.
-- Use the current standing assignment for the requested attendance day.
create or replace function public.dashboard_list_team_on_day(p_day date)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result json;
begin
  if not is_admin_member() then
    raise exception 'Only admins can view staff attendance.' using errcode = 'P0001';
  end if;

  select coalesce(json_agg(row_data order by
    case (row_data->>'status') when 'present' then 0 when 'left' then 1 when 'absent' then 2 else 3 end,
    row_data->>'employee_name'
  ), '[]'::json)
  into result
  from (
    select json_build_object(
      'employee_id', e.id,
      'employee_name', e.name,
      'role', e.role,
      'status', case
        when latest.punch_in is null and assigned_shift.employee_id is not null then 'absent'
        when latest.punch_in is null then 'off'
        when latest.punch_out is null and p_day = (now() at time zone 'Asia/Kolkata')::date then 'present'
        else 'left'
      end,
      'punch_in', latest.punch_in,
      'punch_out', latest.punch_out,
      'attendance_log_id', latest.id,
      'shift_start', assigned_shift.start_time,
      'shift_end', assigned_shift.end_time,
      'scheduled', assigned_shift.employee_id is not null
    ) as row_data
    from public.employees e
    left join lateral (
      select al.id, al.punch_in, al.punch_out
      from public.attendance_logs al
      where al.employee_id = e.id
        and (al.punch_in at time zone 'Asia/Kolkata')::date = p_day
      order by al.punch_in desc
      limit 1
    ) latest on true
    left join public.shifts assigned_shift on assigned_shift.employee_id = e.id
    where e.role <> 'admin'
  ) rows_for_day;

  return result;
end;
$$;

revoke all on function public.dashboard_list_team_on_day(date) from public, anon;
grant execute on function public.dashboard_list_team_on_day(date) to authenticated;

notify pgrst, 'reload schema';
