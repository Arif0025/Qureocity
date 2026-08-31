-- =====================================================================
-- Migration 57: richer plan roster detail payload
-- =====================================================================
-- The admin plan detail panel needs the same child + parent detail
-- payload as the subscriber list, including secondary phone, address,
-- medical info, and receipt number. The older roster RPC only returned
-- the minimum fields needed for a simple list, which prevented the
-- detail expansion from matching the subscriber UX.
-- =====================================================================

create or replace function admin_list_plan_members()
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
    raise exception 'Only admins can view plan members.';
  end if;

  select coalesce(json_agg(row_data order by (row_data->>'plan_name')), '[]'::json)
    into result
  from (
    select json_build_object(
      'plan_id', p.id,
      'plan_name', p.name,
      'plan_type', p.plan_type,
      'event_date', p.event_date,
      'price', p.price,
      'active', p.active,
      'member_count', case when p.plan_type = 'special'
        then coalesce(json_array_length(sm.members), 0)
        else coalesce(json_array_length(rm.members), 0) end,
      'members', case when p.plan_type = 'special'
        then coalesce(sm.members, '[]'::json)
        else coalesce(rm.members, '[]'::json) end
    ) as row_data
    from membership_plans p
    left join lateral (
      select json_agg(json_build_object(
        'child_id', ch.id,
        'child_name', ch.name,
        'age', date_part('year', age(current_date, ch.date_of_birth)),
        'gender', ch.gender,
        'school', ch.school,
        'interests', ch.interests,
        'allergies', ch.allergies,
        'medical_conditions', ch.medical_conditions,
        'special_instructions', ch.special_instructions,
        'parent_name', c.name,
        'phone', c.phone,
        'secondary_phone', c.secondary_phone,
        'address', c.address,
        'started_on', cs.started_on,
        'expires_on', cs.expires_on,
        'currently_active', cs.active and (cs.expires_on is null or cs.expires_on >= current_date),
        'receipt_number', (
          select r.receipt_number
          from membership_registrations r
          where r.child_id = ch.id and r.status = 'confirmed'
          order by r.reviewed_at desc nulls last, r.submitted_at desc
          limit 1
        )
      ) order by ch.name) as members
      from child_subscriptions cs
      join children ch on ch.id = cs.child_id
      join customers c on c.id = ch.customer_id
      where cs.plan_id = p.id
    ) rm on true
    left join lateral (
      select json_agg(json_build_object(
        'pass_id', csp.id,
        'child_id', ch.id,
        'child_name', ch.name,
        'age', date_part('year', age(current_date, ch.date_of_birth)),
        'gender', ch.gender,
        'school', ch.school,
        'interests', ch.interests,
        'allergies', ch.allergies,
        'medical_conditions', ch.medical_conditions,
        'special_instructions', ch.special_instructions,
        'parent_name', c.name,
        'phone', c.phone,
        'secondary_phone', c.secondary_phone,
        'address', c.address,
        'event_date', csp.event_date,
        'purchased_at', csp.purchased_at,
        'attendance_status', case
          when ps.id is null then 'not_attended'
          when ps.status in ('active', 'pending_payment') then 'on_site'
          else 'attended'
        end,
        'checked_in_at', ps.start_time,
        'checked_out_at', ps.ended_at,
        'receipt_number', (
          select r.receipt_number
          from membership_registrations r
          where r.child_id = ch.id and r.status = 'confirmed'
          order by r.reviewed_at desc nulls last, r.submitted_at desc
          limit 1
        )
      ) order by ch.name) as members
      from child_special_passes csp
      join children ch on ch.id = csp.child_id
      join customers c on c.id = ch.customer_id
      left join lateral (
        select ps.id, ps.status, ps.start_time, ps.ended_at
        from play_sessions ps
        where ps.special_pass_id = csp.id
        order by ps.start_time desc
        limit 1
      ) ps on true
      where csp.plan_id = p.id
    ) sm on true
  ) results;
  return result;
end;
$$;

grant execute on function admin_list_plan_members() to authenticated;
