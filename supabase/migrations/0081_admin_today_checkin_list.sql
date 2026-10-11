-- Fetch a filtered set of one day's check-ins only when an admin opens a
-- donut segment. Classification is derived from the plan/pass window at
-- visit time, matching checkin_visit_type() in migration 73.
create or replace function admin_today_checkin_list(p_day date, p_visit_type text default null)
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
    raise exception 'Only admins can view today check-ins.' using errcode = 'P0001';
  end if;

  select coalesce(json_agg(row_data order by checked_in_at desc), '[]'::json)
  into result
  from (
    select
      json_build_object(
        'session_id', ps.id,
        'child_id', ch.id,
        'child_name', ch.name,
        'parent_name', cu.name,
        'parent_phone', cu.phone,
        'checked_in_at', ps.start_time,
        'checked_out_at', coalesce(ps.ended_at, ps.end_time),
        'visit_type', case
          when ps.special_pass_id is not null then 'special'
          when exists (
            select 1 from child_subscriptions cs
            where cs.child_id = ps.child_id
              and cs.started_on <= (ps.start_time at time zone 'Asia/Kolkata')::date
              and (cs.expires_on is null or cs.expires_on >= (ps.start_time at time zone 'Asia/Kolkata')::date)
          ) then 'membership'
          else 'walk_in'
        end,
        'plan_name', case
          when ps.special_pass_id is not null then special_plan.name
          else member_plan.name
        end,
        'membership_started_on', case when ps.special_pass_id is null then membership.started_on end,
        'membership_expires_on', case when ps.special_pass_id is null then membership.expires_on end,
        'is_membership_expired', ps.special_pass_id is null and membership.expires_on is not null and membership.expires_on < (now() at time zone 'Asia/Kolkata')::date
      ) as row_data,
      ps.start_time as checked_in_at,
      case
        when ps.special_pass_id is not null then 'special'
        when exists (
          select 1 from child_subscriptions cs
          where cs.child_id = ps.child_id
            and cs.started_on <= (ps.start_time at time zone 'Asia/Kolkata')::date
            and (cs.expires_on is null or cs.expires_on >= (ps.start_time at time zone 'Asia/Kolkata')::date)
        ) then 'membership'
        else 'walk_in'
      end as resolved_type
    from play_sessions ps
    join children ch on ch.id = ps.child_id
    join customers cu on cu.id = ch.customer_id
    left join child_special_passes special_pass on special_pass.id = ps.special_pass_id
    left join membership_plans special_plan on special_plan.id = special_pass.plan_id
    left join lateral (
      select cs.plan_id, cs.started_on, cs.expires_on
      from child_subscriptions cs
      where cs.child_id = ps.child_id
      order by cs.started_on desc
      limit 1
    ) membership on true
    left join membership_plans member_plan on member_plan.id = membership.plan_id
    where (ps.start_time at time zone 'Asia/Kolkata')::date = p_day
      and ps.status in ('active', 'completed', 'expired')
  ) visits
  where p_visit_type is null or resolved_type = p_visit_type;

  return result;
end;
$$;

revoke all on function admin_today_checkin_list(date, text) from public, anon;
grant execute on function admin_today_checkin_list(date, text) to authenticated;

-- One small server-side roster for a selected calendar day: all staff,
-- that day's shift, and the latest punch record on that day.
create or replace function dashboard_list_team_on_day(p_day date)
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
        when latest.punch_in is null and day_shift.employee_id is not null then 'absent'
        when latest.punch_in is null then 'off'
        when latest.punch_out is null and p_day = (now() at time zone 'Asia/Kolkata')::date then 'present'
        else 'left'
      end,
      'punch_in', latest.punch_in,
      'punch_out', latest.punch_out,
      'attendance_log_id', latest.id,
      'shift_start', day_shift.start_time,
      'shift_end', day_shift.end_time,
      'scheduled', day_shift.employee_id is not null
    ) as row_data
    from employees e
    left join lateral (
      select al.id, al.punch_in, al.punch_out
      from attendance_logs al
      where al.employee_id = e.id
        and (al.punch_in at time zone 'Asia/Kolkata')::date = p_day
      order by al.punch_in desc
      limit 1
    ) latest on true
    left join shifts day_shift on day_shift.employee_id = e.id and day_shift.shift_date = p_day
    where e.role <> 'admin'
  ) rows_for_day;

  return result;
end;
$$;

revoke all on function dashboard_list_team_on_day(date) from public, anon;
grant execute on function dashboard_list_team_on_day(date) to authenticated;
