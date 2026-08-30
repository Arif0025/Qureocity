-- =====================================================================
-- Migration 52: drop special-day payment status, add "attended" to
-- the club check-in list
-- =====================================================================
-- Payment tracking on special passes is being dropped entirely — no
-- more pending/paid flag, no more toggle in the Plans roster.
-- In its place: the club check-in list (Quick Check-in / Directory)
-- now shows whether a special-day child has already attended today,
-- using the same attendance_status logic migration 45 already computes
-- for the Plans roster (derived from the actual play_session linked to
-- their pass, not a manual flag). Check-in stays fully available
-- either way — this is a badge, not a gate. checkin_create_sessions
-- already only blocks a second check-in while a session is currently
-- ACTIVE, so re-entry after checkout was already supported; nothing
-- here changes that.
-- =====================================================================

alter table child_special_passes drop column if exists payment_status;

drop function if exists admin_set_special_pass_payment_status(uuid, text);

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
        'child_id', ch.id, 'child_name', ch.name,
        'age', date_part('year', age(current_date, ch.date_of_birth)),
        'parent_name', c.name, 'phone', c.phone,
        'started_on', cs.started_on, 'expires_on', cs.expires_on,
        'currently_active', cs.active and (cs.expires_on is null or cs.expires_on >= current_date)
      ) order by ch.name) as members
      from child_subscriptions cs
      join children ch on ch.id = cs.child_id
      join customers c on c.id = ch.customer_id
      where cs.plan_id = p.id
    ) rm on true
    left join lateral (
      select json_agg(json_build_object(
        'pass_id', csp.id, 'child_id', ch.id, 'child_name', ch.name,
        'age', date_part('year', age(current_date, ch.date_of_birth)),
        'parent_name', c.name, 'phone', c.phone,
        'event_date', csp.event_date, 'purchased_at', csp.purchased_at,
        'attendance_status', case
          when ps.id is null then 'not_attended'
          when ps.status in ('active', 'pending_payment') then 'on_site'
          else 'attended' end,
        'checked_in_at', ps.start_time,
        'checked_out_at', ps.ended_at
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
$$;

grant execute on function admin_list_plan_members() to authenticated;

-- ---------------------------------------------------------------------
-- Club check-in — swap special_payment_pending for special_attended_today.
-- ---------------------------------------------------------------------
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
      )
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
      )
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