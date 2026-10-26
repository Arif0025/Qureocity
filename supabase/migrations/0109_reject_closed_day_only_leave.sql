-- Reject leave ranges that contain only Tuesdays, when the venue is closed.
create or replace function public.employee_submit_leave_request(
  p_start_date date,
  p_end_date date,
  p_reason text default ''
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid();
  v_today date:=(now() at time zone 'Asia/Kolkata')::date;
  v_id uuid;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if v_uid is null or not exists(select 1 from employees where id=v_uid) then raise exception 'Not authorized.' using errcode='42501'; end if;
  if p_start_date is null or p_end_date is null or p_start_date<v_today or p_end_date<p_start_date then
    raise exception 'Choose a valid date range starting today or later.' using errcode='22023';
  end if;
  if p_end_date-p_start_date>90 then raise exception 'A request cannot exceed 91 calendar days.' using errcode='22023'; end if;
  if length(v_reason)>1000 then raise exception 'Reason must be 1000 characters or fewer.' using errcode='22023'; end if;
  if not exists(
    select 1 from generate_series(p_start_date::timestamp,p_end_date::timestamp,interval '1 day') d
    where extract(dow from d)<>2
  ) then
    raise exception 'Leave must include at least one open workday. The venue is closed on Tuesdays.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if exists(select 1 from employee_leave_requests r where r.employee_id=v_uid and r.status in ('pending','approved') and r.start_date<=p_end_date and r.end_date>=p_start_date) then
    raise exception 'These dates overlap another pending or approved request.' using errcode='23505';
  end if;
  insert into employee_leave_requests(employee_id,start_date,end_date,reason)
    values(v_uid,p_start_date,p_end_date,v_reason) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end $$;
