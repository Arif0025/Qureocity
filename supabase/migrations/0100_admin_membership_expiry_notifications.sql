-- Compact, paged data for the admin notification inbox. The browser only
-- requests the currently selected status and never downloads full customer rows.
create index if not exists idx_child_subscriptions_expiry_date
  on public.child_subscriptions (expires_on)
  where expires_on is not null;

create or replace function public.admin_membership_expiry_alerts(
  p_status text default 'expiring_soon',
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  child_id uuid,
  child_name text,
  parent_name text,
  phone text,
  secondary_phone text,
  plan_name text,
  expires_on date,
  days_remaining int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_admin_member() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_status not in ('expired', 'expiring_soon') then
    raise exception 'Unknown membership expiry filter' using errcode = '22023';
  end if;

  return query
  select ch.id,
    ch.name,
    cu.name,
    cu.phone,
    cu.secondary_phone,
    mp.name,
    cs.expires_on,
    (cs.expires_on - v_today)::int
  from public.child_subscriptions cs
  join public.children ch on ch.id = cs.child_id
  join public.customers cu on cu.id = ch.customer_id
  join public.membership_plans mp on mp.id = cs.plan_id
  where mp.plan_type = 'recurring'
    and cs.expires_on is not null
    and (
      (p_status = 'expiring_soon'
        and cs.active = true
        and cs.expires_on between v_today and v_today + 7)
      or
      (p_status = 'expired'
        and cs.expires_on < v_today
        and not exists (
          select 1
          from public.child_subscriptions current_sub
          where current_sub.child_id = ch.id
            and current_sub.active = true
            and (current_sub.expires_on is null or current_sub.expires_on >= v_today)
        ))
    )
  order by
    case when p_status = 'expiring_soon' then cs.expires_on end asc,
    case when p_status = 'expired' then cs.expires_on end desc,
    ch.name asc
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_membership_expiry_alerts(text, int, int) from public, anon;
grant execute on function public.admin_membership_expiry_alerts(text, int, int) to authenticated;

notify pgrst, 'reload schema';
