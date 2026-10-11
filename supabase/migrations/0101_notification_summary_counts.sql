-- Small, admin-only summary counts for collapsed notification panels.
-- Names and contact details are fetched only after a panel is expanded.

create or replace function public.admin_membership_expiry_alert_counts()
returns table (expiring_soon bigint, expired bigint)
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

  return query
  select
    (
      select count(*)
      from public.child_subscriptions cs
      join public.membership_plans mp on mp.id = cs.plan_id
      where mp.plan_type = 'recurring'
        and cs.active = true
        and cs.expires_on between v_today and v_today + 7
    ),
    (
      select count(*)
      from public.child_subscriptions cs
      join public.membership_plans mp on mp.id = cs.plan_id
      join public.children ch on ch.id = cs.child_id
      where mp.plan_type = 'recurring'
        and cs.expires_on is not null
        and cs.expires_on < v_today
        and not exists (
          select 1
          from public.child_subscriptions current_sub
          where current_sub.child_id = ch.id
            and current_sub.active = true
            and (current_sub.expires_on is null or current_sub.expires_on >= v_today)
        )
    );
end;
$$;

revoke all on function public.admin_membership_expiry_alert_counts() from public, anon;
grant execute on function public.admin_membership_expiry_alert_counts() to authenticated;

create or replace function public.admin_upcoming_child_birthday_count()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_end date := (now() at time zone 'Asia/Kolkata')::date + 30;
  v_start_key int;
  v_end_key int;
  v_count bigint;
begin
  if not is_admin_member() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  v_start_key := extract(month from v_today)::int * 100 + extract(day from v_today)::int;
  v_end_key := extract(month from v_end)::int * 100 + extract(day from v_end)::int;

  select count(*) into v_count
  from public.children ch
  cross join lateral (
    select min(candidate) as birthday_date
    from (
      select make_date(year_value, extract(month from ch.date_of_birth)::int, 1)
        + least(
            extract(day from ch.date_of_birth)::int,
            extract(day from (
              make_date(year_value, extract(month from ch.date_of_birth)::int, 1)
                + interval '1 month - 1 day'
            ))::int
          ) - 1 as candidate
      from (values (extract(year from v_today)::int), (extract(year from v_today)::int + 1)) years(year_value)
    ) possible
    where candidate between v_today and v_end
  ) dates
  where ch.date_of_birth is not null
    and (
      (v_start_key <= v_end_key and
        (extract(month from ch.date_of_birth)::int * 100 + extract(day from ch.date_of_birth)::int) between v_start_key and v_end_key)
      or
      (v_start_key > v_end_key and (
        (extract(month from ch.date_of_birth)::int * 100 + extract(day from ch.date_of_birth)::int) >= v_start_key
        or (extract(month from ch.date_of_birth)::int * 100 + extract(day from ch.date_of_birth)::int) <= v_end_key
      ))
    )
    and dates.birthday_date is not null;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.admin_upcoming_child_birthday_count() from public, anon;
grant execute on function public.admin_upcoming_child_birthday_count() to authenticated;

notify pgrst, 'reload schema';
