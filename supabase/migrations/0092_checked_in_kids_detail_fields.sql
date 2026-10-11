-- Keep the live Kids-on-site card aligned with the check-in activity detail.
-- The active list needs only visit classification, current plan dates, and a
-- medical-info indicator. Do not attach an unrelated latest receipt or
-- private medical details to every row.
create or replace function dashboard_list_checked_in_kids()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_data order by (row_data->>'start_time')), '[]'::json)
  from (
    select json_build_object(
      'session_id', ps.id,
      'child_id', ch.id,
      'child_name', ch.name,
      'age', date_part('year', age(current_date, ch.date_of_birth)),
      'start_time', ps.start_time,
      'end_time', ps.end_time,
      'status', ps.status,
      'parent_name', c.name,
      'phone', c.phone,
      'has_medical_info',
        nullif(trim(ch.allergies), '') is not null
        or nullif(trim(ch.medical_conditions), '') is not null
        or nullif(trim(ch.special_instructions), '') is not null,
      'visit_type', case
        when ps.special_pass_id is not null then 'special'
        when cs2.started_on <= (ps.start_time at time zone 'Asia/Kolkata')::date
          and (cs2.expires_on is null or cs2.expires_on >= (ps.start_time at time zone 'Asia/Kolkata')::date)
          then 'membership'
        else 'walk_in'
      end,
      'plan_name', case when ps.special_pass_id is not null then smp.name else mp.name end,
      'membership_started_on', case when ps.special_pass_id is null then cs2.started_on end,
      'membership_expires_on', case when ps.special_pass_id is null then cs2.expires_on end,
      'is_membership_expired', ps.special_pass_id is null
        and cs2.expires_on is not null
        and cs2.expires_on < (ps.start_time at time zone 'Asia/Kolkata')::date,
      'is_special_today', ps.special_pass_id is not null,
      'special_plan_name', smp.name
    ) as row_data
    from play_sessions ps
    join children ch on ch.id = ps.child_id
    join customers c on c.id = ch.customer_id
    left join child_subscriptions cs2 on cs2.child_id = ch.id
    left join membership_plans mp on mp.id = cs2.plan_id
    left join child_special_passes csp on csp.id = ps.special_pass_id
    left join membership_plans smp on smp.id = csp.plan_id
    where ps.status = 'active'
  ) results;
$$;

grant execute on function dashboard_list_checked_in_kids() to authenticated;
