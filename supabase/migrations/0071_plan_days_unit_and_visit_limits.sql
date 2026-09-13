-- =====================================================================
-- Migration 71: "days" validity unit + optional per-plan visit limits
-- =====================================================================
-- Two independent additions to membership_plans, both optional so every
-- existing plan keeps behaving exactly as before:
--   A) validity_unit gains a 'days' option alongside 'weeks'/'months',
--      for short-run plans that don't fit neatly into a week/month.
--   B) max_visits (nullable int) caps how many check-ins a plan's term
--      allows — e.g. "3 months, but only 12 visits". null keeps a plan
--      time-only/unlimited, same as every plan today.
--
-- child_subscriptions gets a matching max_visits/visits_used pair,
-- snapshotted from the plan at registration/renewal time (same pattern
-- already used for duration_months), so editing a plan's limit later
-- doesn't retroactively change what an already-registered member has.
-- visits_used is drawn down by checkin_create_sessions on every visit
-- that's actually covered by the membership (not a same-day special
-- pass), and can be corrected directly by an admin via
-- admin_set_child_visits.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Part A: schema
-- ---------------------------------------------------------------------
alter table membership_plans
  drop constraint if exists membership_plans_validity_unit_check;
alter table membership_plans
  add constraint membership_plans_validity_unit_check
  check (validity_unit in ('days', 'weeks', 'months'));

alter table membership_plans
  add column if not exists max_visits int,
  add constraint membership_plans_max_visits_check
    check (max_visits is null or max_visits > 0);

alter table child_subscriptions
  add column if not exists max_visits int,
  add column if not exists visits_used int not null default 0;

-- ---------------------------------------------------------------------
-- Part B: apply_plan_to_child — add the 'days' interval case, and
-- snapshot/reset the plan's visit limit on every registration/renewal.
-- ---------------------------------------------------------------------
create or replace function apply_plan_to_child(
  p_child_id uuid,
  p_plan_id uuid,
  p_started_on date default current_date
)
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
    v_expires_on := p_started_on + (
      case v_plan.validity_unit
        when 'days' then (v_plan.validity_value || ' days')::interval
        when 'weeks' then (v_plan.validity_value * 7 || ' days')::interval
        else (v_plan.validity_value || ' months')::interval
      end
    );
    insert into child_subscriptions (
      child_id, active, started_on, expires_on, duration_months, plan_id,
      max_visits, visits_used
    )
    values (
      p_child_id, true, p_started_on, v_expires_on,
      case when v_plan.validity_unit = 'months' then v_plan.validity_value else null end,
      p_plan_id, v_plan.max_visits, 0
    )
    on conflict (child_id) do update set
      active = true,
      started_on = p_started_on,
      expires_on = v_expires_on,
      duration_months = excluded.duration_months,
      plan_id = excluded.plan_id,
      max_visits = excluded.max_visits,
      visits_used = 0,
      updated_at = now();
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Part C: checkin_create_sessions — block check-in for a child whose
-- plan visit limit is exhausted (unless today's visit is instead
-- covered by a special-day pass), and draw down the count on success.
-- Same signature/grants as the 0046 version, body only.
-- ---------------------------------------------------------------------
create or replace function checkin_create_sessions(
  p_customer_id uuid,
  p_child_ids uuid[],
  p_duration_mins int,
  p_client_key text,
  p_status session_status default 'active'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad_count int;
  v_already_in_count int;
  v_sessions json;
  v_exhausted_name text;
begin
  if not check_rate_limit('session:' || p_client_key, 10, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  -- Walk-in sessions are always immediately live. Membership review is
  -- intentionally handled by membership_registrations, not this table.
  if p_status <> 'active' then
    raise exception 'Walk-in sessions are recorded as active.';
  end if;

  select count(*) into v_bad_count
  from unnest(p_child_ids) as cid
  where not exists (
    select 1 from children c where c.id = cid and c.customer_id = p_customer_id
  );
  if v_bad_count > 0 then
    raise exception 'One or more selected children could not be verified.';
  end if;

  select count(*) into v_already_in_count
  from unnest(p_child_ids) as cid
  where exists (
    select 1 from play_sessions ps where ps.child_id = cid and ps.status = 'active'
  );
  if v_already_in_count > 0 then
    raise exception 'One or more selected children are already checked in.';
  end if;

  if p_duration_mins is not null and p_duration_mins not in (60, 120) then
    raise exception 'Invalid duration.';
  end if;

  select ch.name into v_exhausted_name
  from unnest(p_child_ids) as cid
  join children ch on ch.id = cid
  join child_subscriptions cs on cs.child_id = cid
  where cs.active = true
    and (cs.expires_on is null or cs.expires_on >= current_date)
    and cs.max_visits is not null
    and cs.visits_used >= cs.max_visits
    and not exists (
      select 1 from child_special_passes csp
      where csp.child_id = cid
        and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
    )
  limit 1;

  if v_exhausted_name is not null then
    raise exception '% has no visits left on their plan.', v_exhausted_name
      using errcode = 'P0001';
  end if;

  with inserted as (
    insert into play_sessions (child_id, duration_mins, status, special_pass_id)
    select
      cid,
      p_duration_mins,
      'active'::session_status,
      (
        select csp.id
        from child_special_passes csp
        where csp.child_id = cid
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
        limit 1
      )
    from unnest(p_child_ids) as cid
    returning id, child_id, start_time, end_time, status, special_pass_id
  )
  select json_agg(json_build_object(
           'session_id', i.id,
           'child_id', i.child_id,
           'start_time', i.start_time,
           'end_time', i.end_time,
           'status', i.status,
           'special_pass_id', i.special_pass_id
         ))
  into v_sessions
  from inserted i;

  -- Draw down plan visit counts for children whose visit today is
  -- covered by their recurring membership (not a special-day pass).
  update child_subscriptions cs
  set visits_used = cs.visits_used + 1,
      updated_at = now()
  where cs.child_id in (
    select cid from unnest(p_child_ids) as cid
    where not exists (
      select 1 from child_special_passes csp
      where csp.child_id = cid
        and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
    )
  )
  and cs.active = true
  and (cs.expires_on is null or cs.expires_on >= current_date)
  and cs.max_visits is not null;

  return json_build_object('sessions', v_sessions);
end;
$$;

grant execute on function checkin_create_sessions(uuid, uuid[], int, text, session_status) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Part D: admin override — set a member's visits-remaining directly.
-- If p_max_visits is given it also resets/extends the plan's visit cap
-- for this child (e.g. turning on visit tracking for a plan that
-- didn't have it, or granting bonus visits beyond the normal cap).
-- ---------------------------------------------------------------------
create or replace function admin_set_child_visits(
  p_child_id uuid,
  p_visits_remaining int,
  p_max_visits int default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub child_subscriptions;
  v_max int;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if p_visits_remaining < 0 then
    raise exception 'Visits remaining cannot be negative.' using errcode = 'P0001';
  end if;

  select * into v_sub from child_subscriptions where child_id = p_child_id;
  if v_sub.child_id is null then
    raise exception 'This child has no membership subscription yet.' using errcode = 'P0001';
  end if;

  v_max := coalesce(p_max_visits, v_sub.max_visits);
  if v_max is null then
    raise exception 'This plan does not track visits — set a visit limit first.' using errcode = 'P0001';
  end if;
  if p_visits_remaining > v_max then
    v_max := p_visits_remaining;
  end if;

  update child_subscriptions
  set max_visits = v_max,
      visits_used = v_max - p_visits_remaining,
      updated_at = now()
  where child_id = p_child_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function admin_set_child_visits(uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- Part E: surface visits in the read-facing RPCs — Directory, Club
-- check-in, and the Plans roster. Same signatures/grants as before,
-- bodies only, each adding 'max_visits' + 'visits_used' per child.
-- ---------------------------------------------------------------------
create or replace function staff_search_customers(p_query text, p_plan_id uuid default null)
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'customer_id', c.id,
      'parent_name', c.name,
      'phone', c.phone,
      'any_active_subscription', exists (
        select 1 from children ch4
        join child_subscriptions cs4 on cs4.child_id = ch4.id
        where ch4.customer_id = c.id
          and cs4.active = true
          and (cs4.expires_on is null or cs4.expires_on >= current_date)
      ),
      'children', (
        select json_agg(json_build_object(
          'id', ch.id,
          'name', ch.name,
          'age', date_part('year', age(current_date, ch.date_of_birth)),
          'subscription_active', coalesce(cs.active, false),
          'subscription_started_on', cs.started_on,
          'subscription_expires_on', cs.expires_on,
          'plan_name', mp.name,
          'max_visits', cs.max_visits,
          'visits_used', cs.visits_used,
          'allergies', ch.allergies,
          'medical_conditions', ch.medical_conditions,
          'special_instructions', ch.special_instructions,
          'currently_checked_in', exists (
            select 1 from play_sessions ps where ps.child_id = ch.id and ps.status = 'active'
          ),
          'active_session_id', (
            select ps.id from play_sessions ps
            where ps.child_id = ch.id and ps.status = 'active'
            limit 1
          )
        ) order by ch.name)
        from children ch
        left join child_subscriptions cs on cs.child_id = ch.id
        left join membership_plans mp on mp.id = cs.plan_id
        where ch.customer_id = c.id
      ),
      'currently_checked_in', exists (
        select 1
        from play_sessions ps
        join children ch2 on ch2.id = ps.child_id
        where ch2.customer_id = c.id and ps.status = 'active'
      )
    ) as row_data
    from customers c
    where
      p_query <> '' and (
        c.name ilike '%' || p_query || '%'
        or c.phone ilike '%' || p_query || '%'
        or exists (
          select 1 from children ch3
          where ch3.customer_id = c.id and ch3.name ilike '%' || p_query || '%'
        )
      )
      and (
        p_plan_id is null or exists (
          select 1 from children ch5
          left join child_subscriptions cs5 on cs5.child_id = ch5.id
          left join child_special_passes csp5 on csp5.child_id = ch5.id and csp5.plan_id = p_plan_id
          where ch5.customer_id = c.id
            and (cs5.plan_id = p_plan_id or csp5.id is not null)
        )
      )
    order by c.name
    limit 20
  ) results;
$$;

grant execute on function staff_search_customers(text, uuid) to authenticated;

create or replace function staff_list_customers(p_limit int default 30, p_plan_id uuid default null)
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data order by last_activity desc), '[]'::json)
  from (
    select
      json_build_object(
        'customer_id', c.id,
        'parent_name', c.name,
        'phone', c.phone,
        'created_at', c.created_at,
        'any_active_subscription', exists (
          select 1 from children ch4
          join child_subscriptions cs4 on cs4.child_id = ch4.id
          where ch4.customer_id = c.id
            and cs4.active = true
            and (cs4.expires_on is null or cs4.expires_on >= current_date)
        ),
        'children', (
          select json_agg(json_build_object(
            'id', ch.id,
            'name', ch.name,
            'age', date_part('year', age(current_date, ch.date_of_birth)),
            'subscription_active', coalesce(cs.active, false),
            'subscription_started_on', cs.started_on,
            'subscription_expires_on', cs.expires_on,
            'plan_name', mp.name,
            'max_visits', cs.max_visits,
            'visits_used', cs.visits_used,
            'allergies', ch.allergies,
            'medical_conditions', ch.medical_conditions,
            'special_instructions', ch.special_instructions,
            'currently_checked_in', exists (
              select 1 from play_sessions ps where ps.child_id = ch.id and ps.status = 'active'
            ),
            'active_session_id', (
              select ps.id from play_sessions ps
              where ps.child_id = ch.id and ps.status = 'active'
              limit 1
            )
          ) order by ch.name)
          from children ch
          left join child_subscriptions cs on cs.child_id = ch.id
          left join membership_plans mp on mp.id = cs.plan_id
          where ch.customer_id = c.id
        ),
        'currently_checked_in', exists (
          select 1
          from play_sessions ps
          join children ch2 on ch2.id = ps.child_id
          where ch2.customer_id = c.id and ps.status = 'active'
        )
      ) as row_data,
      greatest(
        c.created_at,
        coalesce((
          select max(ps.start_time) from play_sessions ps
          join children ch5 on ch5.id = ps.child_id
          where ch5.customer_id = c.id
        ), c.created_at)
      ) as last_activity
    from customers c
    where
      p_plan_id is null or exists (
        select 1 from children ch6
        left join child_subscriptions cs6 on cs6.child_id = ch6.id
        left join child_special_passes csp6 on csp6.child_id = ch6.id and csp6.plan_id = p_plan_id
        where ch6.customer_id = c.id
          and (cs6.plan_id = p_plan_id or csp6.id is not null)
      )
    order by last_activity desc
    limit p_limit
  ) results;
$$;

grant execute on function staff_list_customers(int, uuid) to authenticated;

create or replace function checkin_search_active_subscribers(p_query text)
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'child_id', ch.id,
      'child_name', ch.name,
      'age', date_part('year', age(current_date, ch.date_of_birth)),
      'customer_id', c.id,
      'parent_name', c.name,
      'phone_last4', right(c.phone, 4),
      'currently_checked_in', exists(
        select 1 from play_sessions ps where ps.child_id = ch.id and ps.status = 'active'
      ),
      'active_session_id', (
        select ps.id from play_sessions ps
        where ps.child_id = ch.id and ps.status = 'active'
        limit 1
      ),
      'is_special_today', exists(
        select 1 from child_special_passes csp
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
      ),
      'special_attended_today', exists(
        select 1 from child_special_passes csp
        join play_sessions ps2 on ps2.special_pass_id = csp.id
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
      ),
      'max_visits', (select cs.max_visits from child_subscriptions cs where cs.child_id = ch.id),
      'visits_used', (select cs.visits_used from child_subscriptions cs where cs.child_id = ch.id)
    ) as row_data
    from children ch
    join customers c on c.id = ch.customer_id
    where
      p_query <> ''
      and ch.name ilike '%' || p_query || '%'
      and (
        exists (
          select 1 from child_subscriptions cs
          where cs.child_id = ch.id and cs.active = true
            and (cs.expires_on is null or cs.expires_on >= current_date)
        )
        or exists (
          select 1 from child_special_passes csp
          where csp.child_id = ch.id
            and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
        )
      )
    order by ch.name
    limit 20
  ) results;
$$;

create or replace function checkin_list_active_subscribers()
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'child_id', ch.id,
      'child_name', ch.name,
      'age', date_part('year', age(current_date, ch.date_of_birth)),
      'customer_id', c.id,
      'parent_name', c.name,
      'phone_last4', right(c.phone, 4),
      'currently_checked_in', exists(
        select 1 from play_sessions ps where ps.child_id = ch.id and ps.status = 'active'
      ),
      'active_session_id', (
        select ps.id from play_sessions ps where ps.child_id = ch.id and ps.status = 'active' limit 1
      ),
      'is_special_today', exists(
        select 1 from child_special_passes csp
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
      ),
      'special_attended_today', exists(
        select 1 from child_special_passes csp
        join play_sessions ps2 on ps2.special_pass_id = csp.id
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
      ),
      'max_visits', (select cs.max_visits from child_subscriptions cs where cs.child_id = ch.id),
      'visits_used', (select cs.visits_used from child_subscriptions cs where cs.child_id = ch.id)
    ) as row_data
    from children ch
    join customers c on c.id = ch.customer_id
    where
      exists (
        select 1 from child_subscriptions cs
        where cs.child_id = ch.id and cs.active = true
          and (cs.expires_on is null or cs.expires_on >= current_date)
      )
      or exists (
        select 1 from child_special_passes csp
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
      )
    order by
      (exists (
        select 1 from child_special_passes csp
        where csp.child_id = ch.id
          and csp.event_date = (now() at time zone 'Asia/Kolkata')::date
      )) desc,
      ch.name
    limit 12
  ) results;
$$;

grant execute on function checkin_search_active_subscribers(text) to authenticated;
grant execute on function checkin_list_active_subscribers() to authenticated;

-- ---------------------------------------------------------------------
-- Part F: Plans roster + Subscriptions list.
-- ---------------------------------------------------------------------
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
        'max_visits', cs.max_visits,
        'visits_used', cs.visits_used,
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
      'max_visits', cs.max_visits,
      'visits_used', cs.visits_used,
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