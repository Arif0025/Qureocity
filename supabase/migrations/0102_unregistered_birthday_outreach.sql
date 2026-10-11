-- Separate birthday outreach from existing party registrations. Party
-- bookings do not store a child FK, so match the child's name plus a
-- normalized parent phone against non-cancelled bookings.

create or replace function public.admin_upcoming_child_birthdays(
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  child_id uuid,
  child_name text,
  date_of_birth date,
  birthday_on date,
  days_until int,
  parent_name text,
  phone text,
  secondary_phone text
)
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
begin
  if not is_admin_member() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  v_start_key := extract(month from v_today)::int * 100 + extract(day from v_today)::int;
  v_end_key := extract(month from v_end)::int * 100 + extract(day from v_end)::int;

  return query
  with matches as (
    select ch.id as matched_child_id,
      ch.name as matched_child_name,
      ch.date_of_birth as matched_dob,
      cu.name as matched_parent_name,
      cu.phone as matched_phone,
      cu.secondary_phone as matched_secondary_phone,
      dates.birthday_date
    from public.children ch
    join public.customers cu on cu.id = ch.customer_id
    cross join lateral (
      select min(candidate) as birthday_date
      from (
        select make_date(year_value, extract(month from ch.date_of_birth)::int, 1)
          + least(
              extract(day from ch.date_of_birth)::int,
              extract(day from (make_date(year_value, extract(month from ch.date_of_birth)::int, 1) + interval '1 month - 1 day'))::int
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
      and not exists (
        select 1
        from public.party_bookings b
        where b.status in ('pending', 'quoted', 'confirmed')
          and lower(trim(b.child_name)) = lower(trim(ch.name))
          and regexp_replace(coalesce(b.phone, ''), '[^0-9]', '', 'g') <> ''
          and regexp_replace(b.phone, '[^0-9]', '', 'g') in (
            nullif(regexp_replace(coalesce(cu.phone, ''), '[^0-9]', '', 'g'), ''),
            nullif(regexp_replace(coalesce(cu.secondary_phone, ''), '[^0-9]', '', 'g'), '')
          )
      )
  )
  select m.matched_child_id,
    m.matched_child_name,
    m.matched_dob,
    m.birthday_date,
    (m.birthday_date - v_today)::int,
    m.matched_parent_name,
    m.matched_phone,
    m.matched_secondary_phone
  from matches m
  order by m.birthday_date, m.matched_child_name
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_upcoming_child_birthdays(int, int) from public, anon;
grant execute on function public.admin_upcoming_child_birthdays(int, int) to authenticated;

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
  join public.customers cu on cu.id = ch.customer_id
  cross join lateral (
    select min(candidate) as birthday_date
    from (
      select make_date(year_value, extract(month from ch.date_of_birth)::int, 1)
        + least(
            extract(day from ch.date_of_birth)::int,
            extract(day from (make_date(year_value, extract(month from ch.date_of_birth)::int, 1) + interval '1 month - 1 day'))::int
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
    and dates.birthday_date is not null
    and not exists (
      select 1
      from public.party_bookings b
      where b.status in ('pending', 'quoted', 'confirmed')
        and lower(trim(b.child_name)) = lower(trim(ch.name))
        and regexp_replace(coalesce(b.phone, ''), '[^0-9]', '', 'g') <> ''
        and regexp_replace(b.phone, '[^0-9]', '', 'g') in (
          nullif(regexp_replace(coalesce(cu.phone, ''), '[^0-9]', '', 'g'), ''),
          nullif(regexp_replace(coalesce(cu.secondary_phone, ''), '[^0-9]', '', 'g'), '')
        )
    );

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.admin_upcoming_child_birthday_count() from public, anon;
grant execute on function public.admin_upcoming_child_birthday_count() to authenticated;

notify pgrst, 'reload schema';
