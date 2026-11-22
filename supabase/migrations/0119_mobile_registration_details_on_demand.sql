-- Keep the mobile registration queue lightweight. Return request summaries
-- first; expose contact and medical details only for one opened request.
create or replace function public.admin_mobile_pending_registration_list(p_limit integer default 30, p_offset integer default 0)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_admin_member() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  return (
    select coalesce(json_agg(q.row_data order by q.submitted_at, q.registration_id), '[]'::json)
    from (
      select r.id as registration_id, r.submitted_at, json_build_object(
        'id', r.id,
        'receipt_number', r.receipt_number,
        'registration_type', r.registration_type,
        'child_name', coalesce(r.child_name, rc.name, 'Existing child'),
        'child_age', date_part('year', age((now() at time zone 'Asia/Kolkata')::date, coalesce(r.date_of_birth, rc.date_of_birth))),
        'parent_name', coalesce(r.parent_name, ru.name, 'Parent unavailable'),
        'plan_name', coalesce(p.name, r.plan_name_snapshot),
        'submitted_at', r.submitted_at
      ) as row_data
      from public.membership_registrations r
      left join public.membership_plans p on p.id = r.plan_id
      left join public.children rc on rc.id = r.renewal_child_id
      left join public.customers ru on ru.id = r.renewal_customer_id
      where r.status = 'pending'
      order by r.submitted_at, r.id
      limit greatest(1, least(coalesce(p_limit, 30), 100))
      offset greatest(coalesce(p_offset, 0), 0)
    ) q
  );
end;
$$;

create or replace function public.admin_mobile_pending_registration_detail(p_registration_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_admin_member() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  return (
    select json_build_object(
      'id', r.id,
      'receipt_number', r.receipt_number,
      'registration_type', r.registration_type,
      'child_name', coalesce(r.child_name, rc.name, 'Existing child'),
      'date_of_birth', coalesce(r.date_of_birth, rc.date_of_birth),
      'gender', r.gender,
      'school', r.school,
      'interests', r.interests,
      'allergies', r.allergies,
      'medical_conditions', r.medical_conditions,
      'special_instructions', r.special_instructions,
      'parent_name', coalesce(r.parent_name, ru.name, 'Parent unavailable'),
      'phone', coalesce(r.phone, ru.phone),
      'secondary_phone', r.secondary_phone,
      'address', r.address,
      'plan_name', coalesce(p.name, r.plan_name_snapshot),
      'plan_event_date', p.event_date,
      'special_event_date', r.special_event_date,
      'how_heard', r.how_heard,
      'photo_consent', r.photo_consent,
      'whatsapp_consent', r.whatsapp_consent,
      'submitted_at', r.submitted_at
    )
    from public.membership_registrations r
    left join public.membership_plans p on p.id = r.plan_id
    left join public.children rc on rc.id = r.renewal_child_id
    left join public.customers ru on ru.id = r.renewal_customer_id
    where r.id = p_registration_id and r.status = 'pending'
  );
end;
$$;

revoke all on function public.admin_mobile_pending_registration_list(integer, integer) from public, anon;
revoke all on function public.admin_mobile_pending_registration_detail(uuid) from public, anon;
grant execute on function public.admin_mobile_pending_registration_list(integer, integer) to authenticated;
grant execute on function public.admin_mobile_pending_registration_detail(uuid) to authenticated;
notify pgrst, 'reload schema';
