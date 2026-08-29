-- =====================================================================
-- Migration 44: admin-initiated punch-in
-- =====================================================================
-- Allows an admin to record a staff member's arrival when the QR scanner
-- is unavailable. Keep this separate from a normal self punch-in so the
-- audit trail accurately identifies a manual fallback entry.

alter table attendance_logs
  add column if not exists admin_punched_in boolean not null default false;

create or replace function admin_force_punch_in(p_employee_id uuid)
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

  if not exists (select 1 from employees where id = p_employee_id) then
    raise exception 'Employee not found.' using errcode = 'P0001';
  end if;

  -- Serialize requests for this employee so two admin screens cannot create
  -- duplicate open attendance records at the same time.
  perform pg_advisory_xact_lock(hashtext(p_employee_id::text));

  if exists (
    select 1 from attendance_logs
    where employee_id = p_employee_id and punch_out is null
  ) then
    return json_build_object('success', false, 'reason', 'already_on_duty');
  end if;

  insert into attendance_logs (employee_id, admin_punched_in)
  values (p_employee_id, true)
  returning * into v_row;

  return json_build_object('success', true, 'attendance_log_id', v_row.id);
end;
$$;

grant execute on function admin_force_punch_in(uuid) to authenticated;
