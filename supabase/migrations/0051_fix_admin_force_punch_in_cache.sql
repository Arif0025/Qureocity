-- =====================================================================
-- Migration 51: fix "function not found in schema cache" for
-- admin_force_punch_in
-- =====================================================================
-- Not a shift-assignment issue — admin_force_punch_in only touches
-- employees + attendance_logs, no shift table involved. The error means
-- PostgREST's schema cache doesn't know this function exists, which
-- happens when either the migration never actually ran, or it ran but
-- nothing told PostgREST to refresh (migration 0044 didn't end with a
-- reload notice). Re-declaring it here is safe either way — create or
-- replace is a no-op if it's already correct — and the NOTIFY forces
-- PostgREST to pick it up immediately instead of waiting on its own
-- polling cycle.
--
-- The same root cause (0044 never having actually run) also breaks
-- admin_save_attendance_log (migration 0047, "edit attendance for a
-- different day") with a separate error — "column admin_punched_in
-- does not exist" — since that function writes to a column only 0044
-- creates. Re-adding every attendance_logs column this admin-tooling
-- cluster depends on here closes out both at once.
-- =====================================================================

alter table attendance_logs
  add column if not exists admin_punched_in boolean not null default false,
  add column if not exists admin_punched_out boolean not null default false,
  add column if not exists admin_edited boolean not null default false,
  add column if not exists admin_edited_at timestamptz;

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

notify pgrst, 'reload schema';