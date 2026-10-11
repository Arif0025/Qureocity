-- Lightweight plan-card counts. The full roster RPC includes contact and
-- medical details, so it must not be used just to display totals.
create or replace function admin_plan_member_counts()
returns table(plan_id uuid, member_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin_member() then
    raise exception 'Only admins can view plan member counts.' using errcode = 'P0001';
  end if;

  return query
  with subscription_counts as (
    select cs.plan_id, count(*)::bigint as total
    from child_subscriptions cs
    group by cs.plan_id
  ), special_pass_counts as (
    select csp.plan_id, count(*)::bigint as total
    from child_special_passes csp
    group by csp.plan_id
  )
  select p.id,
    case when p.plan_type = 'special'
      then coalesce(sp.total, 0)
      else coalesce(subs.total, 0)
    end
  from membership_plans p
  left join subscription_counts subs on subs.plan_id = p.id
  left join special_pass_counts sp on sp.plan_id = p.id;
end;
$$;

revoke all on function admin_plan_member_counts() from public, anon;
grant execute on function admin_plan_member_counts() to authenticated;

notify pgrst, 'reload schema';
