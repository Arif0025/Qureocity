-- Migration 63: allow admins to remove an incorrect attendance punch.

create or replace function admin_delete_attendance_log(
  p_employee_id uuid,
  p_log_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_id uuid;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_employee_id::text));

  delete from attendance_logs
  where id = p_log_id and employee_id = p_employee_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    return json_build_object('success', false, 'reason', 'not_found');
  end if;

  return json_build_object(
    'success', true,
    'attendance_log_id', v_deleted_id
  );
end;
$$;

grant execute on function admin_delete_attendance_log(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';