-- =====================================================================
-- Migration 47: admin attendance corrections
-- =====================================================================

alter table attendance_logs
  add column if not exists admin_edited boolean not null default false,
  add column if not exists admin_edited_at timestamptz;

create or replace function admin_save_attendance_log(
  p_employee_id uuid,
  p_log_id uuid default null,
  p_punch_in timestamptz default null,
  p_punch_out timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row attendance_logs;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  if p_punch_in is null then
    raise exception 'Punch-in time is required.' using errcode = 'P0001';
  end if;
  if p_punch_out is not null and p_punch_out < p_punch_in then
    raise exception 'Punch-out cannot be earlier than punch-in.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from employees where id = p_employee_id) then
    raise exception 'Employee not found.' using errcode = 'P0001';
  end if;

  if p_log_id is null then
    insert into attendance_logs (
      employee_id, punch_in, punch_out, admin_punched_in, admin_punched_out,
      admin_edited, admin_edited_at
    ) values (
      p_employee_id, p_punch_in, p_punch_out, true, p_punch_out is not null,
      true, now()
    )
    returning * into v_row;
  else
    update attendance_logs
    set punch_in = p_punch_in,
        punch_out = p_punch_out,
        admin_edited = true,
        admin_edited_at = now()
    where id = p_log_id and employee_id = p_employee_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'Attendance record not found for this employee.' using errcode = 'P0001';
    end if;
  end if;

  return json_build_object('success', true, 'attendance_log_id', v_row.id);
end;
$$;

grant execute on function admin_save_attendance_log(uuid, uuid, timestamptz, timestamptz) to authenticated;
