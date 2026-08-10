-- =====================================================================
-- Migration 31: full-detail membership list
-- =====================================================================
-- admin_list_child_subscriptions() only returned 6 flat fields. The
-- Memberships tab needs everything on record for a child/family — this
-- replaces it with the full set, plus the plan name where one is known
-- (from that child's most recent confirmed registration, since
-- child_subscriptions itself doesn't store which plan was purchased —
-- subscriptions added manually via the admin UI never had a plan to
-- begin with).
-- =====================================================================

create or replace function admin_list_child_subscriptions()
returns json
language sql
stable
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
      'plan_name', (
        select mp.name
        from membership_registrations r
        join membership_plans mp on mp.id = r.plan_id
        where r.child_id = ch.id and r.status = 'confirmed'
        order by r.reviewed_at desc
        limit 1
      ),
      'receipt_number', (
        select r.receipt_number
        from membership_registrations r
        where r.child_id = ch.id and r.status = 'confirmed'
        order by r.reviewed_at desc
        limit 1
      )
    ) as row_data
    from child_subscriptions cs
    join children ch on ch.id = cs.child_id
    join customers c on c.id = ch.customer_id
  ) results;
$$;

grant execute on function admin_list_child_subscriptions() to authenticated;