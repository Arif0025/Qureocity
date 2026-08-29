-- =====================================================================
-- Migration 45: link special-day check-ins to the registered pass
-- =====================================================================
-- A child can be both a regular member and registered for a special day.
-- Store the exact pass used for the session so event attendance is never
-- inferred from an unrelated visit on the same date.

alter table play_sessions
  add column if not exists special_pass_id uuid
    references child_special_passes(id) on delete set null;

create index if not exists idx_play_sessions_special_pass
  on play_sessions(special_pass_id)
  where special_pass_id is not null;

create or replace function checkin_create_sessions(
  p_customer_id uuid,
  p_child_ids uuid[],
  p_duration_mins int,
  p_client_key text,
  p_status session_status default 'pending_payment'
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
begin
  if not check_rate_limit('session:' || p_client_key, 10, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  if p_status not in ('pending_payment', 'active') then
    raise exception 'Invalid initial session status.';
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
    select 1 from play_sessions ps
    where ps.child_id = cid and ps.status in ('active', 'pending_payment')
  );
  if v_already_in_count > 0 then
    raise exception 'One or more selected children are already checked in.';
  end if;

  if p_duration_mins is not null and p_duration_mins not in (60, 120) then
    raise exception 'Invalid duration.';
  end if;

  with inserted as (
    insert into play_sessions (child_id, duration_mins, status, special_pass_id)
    select
      cid,
      p_duration_mins,
      p_status,
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

  return json_build_object('sessions', v_sessions);
end;
$$;

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
        'payment_status', csp.payment_status,
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

grant execute on function checkin_create_sessions(uuid, uuid[], int, text, session_status) to anon, authenticated;
grant execute on function admin_list_plan_members() to authenticated;
