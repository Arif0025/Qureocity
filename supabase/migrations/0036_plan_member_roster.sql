-- =====================================================================
-- Migration 36: plan membership roster
-- =====================================================================
-- Two things:
--   A) child_subscriptions never actually stored which plan it came
--      from — the admin list inferred it by looking at the child's most
--      recent CONFIRMED registration, of ANY type. Now that special-day
--      plans exist too, that inference could easily attribute a
--      recurring subscription to a special plan's name if the special
--      pass happened to be purchased more recently. Fixed at the
--      source: child_subscriptions gets its own plan_id column,
--      written directly by apply_plan_to_child, same pattern already
--      used by child_special_passes.
--   B) admin_list_plan_members() — per-plan roster for the new
--      "registered members" showcase on the admin Plans tab.
-- =====================================================================

alter table child_subscriptions
  add column if not exists plan_id uuid references membership_plans(id);

-- Backfill from registration history for existing rows (best-effort,
-- same inference the UI used before — only for rows written before
-- this migration; every row going forward is written directly).
update child_subscriptions cs
set plan_id = (
  select mp.id
  from membership_registrations r
  join membership_plans mp on mp.id = r.plan_id
  where r.child_id = cs.child_id
    and r.status = 'confirmed'
    and mp.plan_type = 'recurring'
  order by r.reviewed_at desc nulls last, r.submitted_at desc
  limit 1
)
where cs.plan_id is null;

-- Rewritten to set plan_id going forward.
create or replace function apply_plan_to_child(p_child_id uuid, p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan membership_plans;
  v_expires_on date;
begin
  select * into v_plan from membership_plans where id = p_plan_id;
  if v_plan.id is null then
    return;
  end if;

  if v_plan.plan_type = 'special' then
    insert into child_special_passes (child_id, plan_id, event_date)
    values (p_child_id, p_plan_id, v_plan.event_date)
    on conflict (child_id, plan_id) do update set event_date = excluded.event_date;
  else
    v_expires_on := current_date + (
      case v_plan.validity_unit
        when 'weeks' then (v_plan.validity_value * 7 || ' days')::interval
        else (v_plan.validity_value || ' months')::interval
      end
    );
    insert into child_subscriptions (child_id, active, started_on, expires_on, duration_months, plan_id)
    values (
      p_child_id, true, current_date, v_expires_on,
      case when v_plan.validity_unit = 'months' then v_plan.validity_value else null end,
      p_plan_id
    )
    on conflict (child_id) do update set
      active = true,
      started_on = current_date,
      expires_on = v_expires_on,
      duration_months = excluded.duration_months,
      plan_id = excluded.plan_id,
      updated_at = now();
  end if;
end;
$$;

-- Simplified: plan_name now comes straight from the row's own plan_id
-- instead of re-inferring it from registration history.
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
      'plan_name', coalesce(
        mp.name,
        (
          select mp2.name
          from membership_registrations r
          join membership_plans mp2 on mp2.id = r.plan_id
          where r.child_id = ch.id and r.status = 'confirmed'
          order by r.reviewed_at desc nulls last, r.submitted_at desc
          limit 1
        )
      ),
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
    left join membership_plans mp on mp.id = cs.plan_id
  ) results;
$$;

grant execute on function admin_list_child_subscriptions() to authenticated;

-- ---------------------------------------------------------------------
-- Part B: per-plan member roster for the admin "Plans" tab showcase.
-- Every plan (recurring or special) resolves its own members list
-- directly off plan_id — no more guessing.
-- ---------------------------------------------------------------------
create or replace function admin_list_plan_members()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_data order by (row_data->>'plan_name')), '[]'::json)
  from (
    select json_build_object(
      'plan_id', p.id,
      'plan_name', p.name,
      'plan_type', p.plan_type,
      'event_date', p.event_date,
      'price', p.price,
      'active', p.active,
      'member_count',
        case when p.plan_type = 'special'
          then coalesce(json_array_length(sm.members), 0)
          else coalesce(json_array_length(rm.members), 0)
        end,
      'members',
        case when p.plan_type = 'special'
          then coalesce(sm.members, '[]'::json)
          else coalesce(rm.members, '[]'::json)
        end
    ) as row_data
    from membership_plans p
    left join lateral (
      select json_agg(json_build_object(
               'child_id', ch.id,
               'child_name', ch.name,
               'age', date_part('year', age(current_date, ch.date_of_birth)),
               'parent_name', c.name,
               'phone', c.phone,
               'started_on', cs.started_on,
               'expires_on', cs.expires_on,
               'currently_active', cs.active and (cs.expires_on is null or cs.expires_on >= current_date)
             ) order by ch.name) as members
      from child_subscriptions cs
      join children ch on ch.id = cs.child_id
      join customers c on c.id = ch.customer_id
      where cs.plan_id = p.id
    ) rm on true
    left join lateral (
      select json_agg(json_build_object(
               'child_id', ch.id,
               'child_name', ch.name,
               'age', date_part('year', age(current_date, ch.date_of_birth)),
               'parent_name', c.name,
               'phone', c.phone,
               'event_date', csp.event_date,
               'purchased_at', csp.purchased_at
             ) order by ch.name) as members
      from child_special_passes csp
      join children ch on ch.id = csp.child_id
      join customers c on c.id = ch.customer_id
      where csp.plan_id = p.id
    ) sm on true
  ) results;
$$;

grant execute on function admin_list_plan_members() to authenticated;