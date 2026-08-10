-- =====================================================================
-- Migration 28: admin-initiated punch-out
-- =====================================================================
-- Distinct from a normal punch-out (employee's own action) and from
-- auto_punched_out (the 9:30 PM cron safety net) — this is an admin
-- deliberately closing someone's attendance for the day, e.g. they left
-- without punching out and it's confirmed they're gone. Flagged
-- separately so the record is honest about who closed it and why.
-- =====================================================================

alter table attendance_logs
  add column if not exists admin_punched_out boolean not null default false;

create or replace function admin_force_punch_out(p_employee_id uuid)
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

  update attendance_logs
  set punch_out = now(),
      admin_punched_out = true
  where employee_id = p_employee_id
    and punch_out is null
  returning * into v_row;

  if v_row.id is null then
    return json_build_object('success', false, 'reason', 'not_on_duty');
  end if;

  return json_build_object('success', true, 'attendance_log_id', v_row.id);
end;
$$;

grant execute on function admin_force_punch_out(uuid) to authenticated;