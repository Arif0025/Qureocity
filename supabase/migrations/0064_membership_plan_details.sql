-- Migration 64: include plan details in staff membership listings.

create or replace function admin_list_child_subscriptions()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_data order by (row_data->>'expires_on')), '[]'::json)
  from (
    select json_build_object(
      'child_id', ch.id,
      'child_name', ch.name,
      'date_of_birth', ch.date_of_birth,
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
      'how_heard', c.how_heard,
      'photo_consent', c.photo_consent,
      'whatsapp_consent', c.whatsapp_consent,
      'active', cs.active,
      'started_on', cs.started_on,
      'expires_on', cs.expires_on,
      'plan_name', p.name,
      'plan_description', p.description,
      'receipt_number', (
        select r.receipt_number
        from membership_registrations r
        where r.child_id = ch.id and r.status = 'confirmed'
        order by r.reviewed_at desc nulls last, r.submitted_at desc
        limit 1
      )
    ) as row_data
    from child_subscriptions cs
    join children ch on ch.id = cs.child_id
    join customers c on c.id = ch.customer_id
    left join membership_plans p on p.id = cs.plan_id
  ) results;
$$;

grant execute on function admin_list_child_subscriptions() to authenticated;
notify pgrst, 'reload schema';