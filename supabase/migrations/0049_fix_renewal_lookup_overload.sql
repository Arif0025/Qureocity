-- =====================================================================
-- Migration 49: fix renewal_lookup ambiguous-overload error
-- =====================================================================
-- Migration 41 added p_plan_id via `create or replace function
-- renewal_lookup(p_phone text, p_client_key text, p_plan_id uuid
-- default null)`. Postgres treats a different parameter list as a new
-- overload rather than a replacement, so the original two-argument
-- renewal_lookup(text, text) from migration 37 is still sitting in the
-- database alongside it. Any call with just (p_phone, p_client_key) —
-- which is every call RenewalFlow.tsx makes — is ambiguous between the
-- two, since the three-arg version's p_plan_id default also matches a
-- two-argument call. Dropping the dead overload removes the ambiguity;
-- the NOTIFY forces PostgREST to pick up the change immediately.
-- =====================================================================

drop function if exists renewal_lookup(text, text);

-- Sanity-recreate the three-arg version so this migration is safe to
-- run even if 0041 hasn't been applied for some reason.
create or replace function renewal_lookup(
  p_phone text,
  p_client_key text,
  p_plan_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer customers;
  v_children json;
begin
  if not check_rate_limit('renewal-lookup:' || p_client_key, 8, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  select * into v_customer from customers where phone = p_phone;

  if v_customer.id is null then
    return json_build_object('found', false);
  end if;

  select json_agg(json_build_object(
           'id', c.id,
           'name', c.name,
           'age', date_part('year', age(current_date, c.date_of_birth)),
           'current_plan_name', mp.name,
           'current_plan_expires_on', cs.expires_on,
           'current_plan_active', coalesce(
             cs.active and (cs.expires_on is null or cs.expires_on >= current_date),
             false
           ),
           'already_registered_for_plan',
             p_plan_id is not null and (
               exists (
                 select 1 from child_special_passes csp
                 where csp.child_id = c.id and csp.plan_id = p_plan_id
               )
               or exists (
                 select 1 from membership_registrations r
                 where r.renewal_child_id = c.id
                   and r.plan_id = p_plan_id
                   and r.status = 'pending'
               )
             )
         ) order by c.name)
  into v_children
  from children c
  left join child_subscriptions cs on cs.child_id = c.id
  left join membership_plans mp on mp.id = (
    select r2.plan_id from membership_registrations r2
    join membership_plans mp2 on mp2.id = r2.plan_id
    where r2.renewal_child_id = c.id and r2.status = 'confirmed'
      and mp2.plan_type = 'recurring'
    order by r2.reviewed_at desc nulls last, r2.submitted_at desc
    limit 1
  )
  where c.customer_id = v_customer.id;

  return json_build_object(
    'found', true,
    'customer_id', v_customer.id,
    'parent_name', v_customer.name,
    'children', coalesce(v_children, '[]'::json)
  );
end;
$$;

grant execute on function renewal_lookup(text, text, uuid) to anon, authenticated;

-- Same class of bug, not yet triggering an error only because every
-- current call site happens to pass both arguments — closing it out
-- now rather than waiting for it to bite too.
drop function if exists staff_search_customers(text);
drop function if exists staff_list_customers(int);

notify pgrst, 'reload schema';