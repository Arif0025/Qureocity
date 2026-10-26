-- Return only this month's per-employee paid leave totals to the admin UI.
-- The previous client query downloaded every approved request and all its
-- paid dates, including historical dates, then filtered them in JavaScript.
create index if not exists employee_leave_paid_dates_approved_gin_idx
  on public.employee_leave_requests using gin (paid_dates)
  where status = 'approved';

create or replace function public.admin_paid_leave_days_this_month()
returns table(employee_id uuid, paid_days bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_month_start date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
  v_month_end date := (date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month')::date;
  v_month_dates date[];
begin
  if not is_admin_member() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select array_agg(day::date)
    into v_month_dates
    from generate_series(v_month_start, v_month_end - 1, interval '1 day') as days(day);

  return query
    select r.employee_id, count(paid.day)::bigint
    from public.employee_leave_requests r
    cross join lateral unnest(r.paid_dates) as paid(day)
    where r.status = 'approved'
      and r.paid_dates && v_month_dates
      and paid.day >= v_month_start
      and paid.day < v_month_end
    group by r.employee_id;
end;
$$;

revoke all on function public.admin_paid_leave_days_this_month() from public, anon;
grant execute on function public.admin_paid_leave_days_this_month() to authenticated;
notify pgrst, 'reload schema';
