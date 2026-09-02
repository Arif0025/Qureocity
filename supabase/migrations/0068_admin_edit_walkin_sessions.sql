-- Migration 68: admin edit/remove controls for walk-in sessions.

create or replace function admin_day_detail(p_day date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  select json_build_object(
    'checkins', coalesce((
      select json_agg(row_data order by (row_data->>'checked_in_at'))
      from (
        select json_build_object(
          'session_id', ps.id,
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
        where (ps.start_time at time zone 'Asia/Kolkata')::date = p_day
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
        where (al.punch_in at time zone 'Asia/Kolkata')::date = p_day
      ) sub
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

create or replace function admin_update_walkin_session(
  p_session_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration_mins int;
  v_status session_status;
  v_child_id uuid;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if p_started_at is null or p_started_at > now() then
    raise exception 'Check-in time cannot be in the future.' using errcode = 'P0001';
  end if;
  if p_ended_at is not null and (p_ended_at <= p_started_at or p_ended_at > now()) then
    raise exception 'Check-out time must be after check-in and not in the future.' using errcode = 'P0001';
  end if;

  select child_id into v_child_id from play_sessions where id = p_session_id;
  if v_child_id is null then
    raise exception 'Walk-in session not found.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_child_id::text));
  v_status := case when p_ended_at is null then 'active' else 'completed' end;
  v_duration_mins := case
    when p_ended_at is null then null
    else floor(extract(epoch from (p_ended_at - p_started_at)) / 60)::int
  end;

  if v_status = 'active' and exists (
    select 1 from play_sessions
    where child_id = v_child_id and status = 'active' and id <> p_session_id
  ) then
    raise exception 'This child already has an active session.' using errcode = 'P0001';
  end if;

  update play_sessions
  set start_time = p_started_at,
      ended_at = p_ended_at,
      duration_mins = v_duration_mins,
      end_time = p_ended_at,
      status = v_status
  where id = p_session_id;

  return json_build_object('success', true, 'session_id', p_session_id);
end;
$$;

create or replace function admin_delete_walkin_session(p_session_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child_id uuid;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  select child_id into v_child_id from play_sessions where id = p_session_id;
  if v_child_id is null then
    return json_build_object('success', false, 'reason', 'not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext(v_child_id::text));
  delete from play_sessions where id = p_session_id;
  return json_build_object('success', true, 'session_id', p_session_id);
end;
$$;

grant execute on function admin_day_detail(date) to authenticated;
grant execute on function admin_update_walkin_session(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function admin_delete_walkin_session(uuid) to authenticated;
notify pgrst, 'reload schema';