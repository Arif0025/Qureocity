-- Migration 61: close punch-in race conditions and protect attendance edits.

-- Close any legacy duplicate open rows, keeping the latest punch-in for
-- each employee as the canonical open row before adding the constraint.
with ranked_open_logs as (
  select
    id,
    row_number() over (
      partition by employee_id order by punch_in desc, id desc
    ) as row_number
  from attendance_logs
  where punch_out is null
)
update attendance_logs al
set punch_out = now(),
    admin_punched_out = true,
    admin_edited = true,
    admin_edited_at = now()
from ranked_open_logs rol
where al.id = rol.id and rol.row_number > 1;

-- There must be at most one currently open attendance row per employee.
create unique index if not exists attendance_logs_one_open_per_employee
  on attendance_logs(employee_id)
  where punch_out is null;

-- Attendance changes must go through the guarded RPCs below. Keep SELECT
-- access for staff dashboards, but remove direct row creation/editing.
revoke insert, update on attendance_logs from authenticated;

-- Employee punch toggling and dynamic-token consumption happen in one
-- transaction. The advisory lock serializes simultaneous scans/clicks.
create or replace function employee_toggle_punch(p_token_hash text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid := auth.uid();
  v_open_id uuid;
  v_action text;
begin
  if v_employee_id is null or not exists (
    select 1 from employees where id = v_employee_id
  ) then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_employee_id::text));

  if p_token_hash is not null then
    begin
      insert into used_qr_tokens (token_hash) values (p_token_hash);
    exception when unique_violation then
      raise exception 'This code was just used — please rescan.'
        using errcode = 'P0001';
    end;
  end if;

  select id into v_open_id
  from attendance_logs
  where employee_id = v_employee_id and punch_out is null
  order by punch_in desc
  limit 1
  for update;

  if v_open_id is not null then
    update attendance_logs
    set punch_out = now()
    where id = v_open_id;
    v_action := 'out';
  else
    insert into attendance_logs (employee_id)
    values (v_employee_id);
    v_action := 'in';
  end if;

  return json_build_object('ok', true, 'action', v_action, 'at', now());
end;
$$;

revoke all on function employee_toggle_punch(text) from public;
grant execute on function employee_toggle_punch(text) to authenticated;

-- Keep the admin correction tool from reopening a second attendance row.
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

  perform pg_advisory_xact_lock(hashtext(p_employee_id::text));

  if p_punch_out is null and exists (
    select 1 from attendance_logs
    where employee_id = p_employee_id
      and punch_out is null
      and (p_log_id is null or id <> p_log_id)
  ) then
    raise exception 'This employee already has an open attendance record.'
      using errcode = 'P0001';
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

-- Force-out is serialized with employee punch operations.
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

  perform pg_advisory_xact_lock(hashtext(p_employee_id::text));

  update attendance_logs
  set punch_out = now(), admin_punched_out = true
  where employee_id = p_employee_id and punch_out is null
  returning * into v_row;

  if v_row.id is null then
    return json_build_object('success', false, 'reason', 'not_on_duty');
  end if;
  return json_build_object('success', true, 'attendance_log_id', v_row.id);
end;
$$;

grant execute on function admin_force_punch_out(uuid) to authenticated;

notify pgrst, 'reload schema';