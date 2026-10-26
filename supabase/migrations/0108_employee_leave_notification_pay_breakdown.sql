-- Tell employees exactly which approved leave dates are paid.
create or replace function public.admin_review_leave_request(
  p_request_id uuid,
  p_decision text,
  p_paid_dates date[] default '{}',
  p_review_note text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_req employee_leave_requests;
  v_paid date[]:=coalesce(p_paid_dates,'{}');
  v_note text:=nullif(btrim(coalesce(p_review_note,'')),'');
  v_hours numeric(6,2);
  v_paid_text text;
  v_unpaid_text text;
begin
  if not is_admin_member() then raise exception 'Admin access required.' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Choose approve or decline.' using errcode='22023'; end if;
  if length(coalesce(v_note,''))>1000 then raise exception 'Review note is too long.' using errcode='22023'; end if;
  select * into v_req from employee_leave_requests where id=p_request_id for update;
  if v_req.id is null then raise exception 'Leave request not found.' using errcode='P0002'; end if;
  if v_req.status<>'pending' then raise exception 'This request has already been reviewed.' using errcode='P0001'; end if;
  if p_decision='approved' then
    if cardinality(v_paid)<>(select count(distinct d) from unnest(v_paid) d) then raise exception 'Paid dates contain duplicates.' using errcode='22023'; end if;
    if exists(select 1 from unnest(v_paid) d where d<v_req.start_date or d>v_req.end_date or extract(dow from d)=2) then
      raise exception 'Paid dates must be working days within the request.' using errcode='22023';
    end if;
    select round(extract(epoch from(s.end_time-s.start_time))/3600.0,2) into v_hours from shifts s where s.employee_id=v_req.employee_id;
    select string_agg(to_char(d,'DD Mon'),', ' order by d) into v_paid_text from unnest(v_paid) d;
    select string_agg(to_char(d::date,'DD Mon'),', ' order by d) into v_unpaid_text
      from generate_series(v_req.start_date::timestamp,v_req.end_date::timestamp,interval '1 day') d
      where extract(dow from d)<>2 and not (d::date=any(v_paid));
  else
    v_paid:='{}'; v_hours:=null;
  end if;
  update employee_leave_requests set status=p_decision,paid_dates=v_paid,paid_shift_hours=v_hours,review_note=v_note,reviewed_at=now(),reviewed_by=auth.uid() where id=p_request_id;
  insert into employee_notifications(user_id,category,title,body,target_url) values(
    v_req.employee_id,'admin',case when p_decision='approved' then 'Leave request approved' else 'Leave request declined' end,
    case when p_decision='approved' then
      format('Your leave from %s to %s was approved. Paid dates: %s. Unpaid dates: %s.',v_req.start_date,v_req.end_date,coalesce(v_paid_text,'none'),coalesce(v_unpaid_text,'none'))
      else format('Your leave from %s to %s was declined.',v_req.start_date,v_req.end_date) end,
    '/employee?tab=activity'
  );
  return jsonb_build_object('ok',true);
end $$;
