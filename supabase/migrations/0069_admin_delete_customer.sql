-- Migration 69: allow admins to remove a customer while preserving history.

create or replace function admin_delete_customer(p_customer_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child_count int;
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from customers where id = p_customer_id) then
    return json_build_object('success', false, 'reason', 'not_found');
  end if;
  if exists (
    select 1 from membership_registrations
    where status = 'pending'
      and (customer_id = p_customer_id or renewal_customer_id = p_customer_id)
  ) then
    raise exception 'Confirm or discard this customer''s pending registrations first.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_child_count
  from children where customer_id = p_customer_id;

  -- Preserve registration history as snapshots while detaching rows that
  -- would otherwise block deletion or be removed by child cascades.
  update membership_registrations
  set customer_id = null,
      child_id = null,
      renewal_customer_id = null,
      renewal_child_id = null
  where customer_id = p_customer_id or renewal_customer_id = p_customer_id;

  delete from customers where id = p_customer_id;

  return json_build_object('success', true, 'children_deleted', v_child_count);
end;
$$;

grant execute on function admin_delete_customer(uuid) to authenticated;
notify pgrst, 'reload schema';
