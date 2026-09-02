-- Migration 65: allow admins to correct customer and child details.

create or replace function admin_update_customer_child_details(
  p_customer_id uuid,
  p_child_id uuid,
  p_parent_name text,
  p_child_name text,
  p_date_of_birth date,
  p_address text,
  p_allergies text,
  p_medical_conditions text,
  p_special_instructions text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_name text := trim(coalesce(p_parent_name, ''));
  v_child_name text := trim(coalesce(p_child_name, ''));
begin
  if not is_admin_member() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if v_parent_name = '' then
    raise exception 'Parent name is required.' using errcode = 'P0001';
  end if;
  if v_child_name = '' then
    raise exception 'Child name is required.' using errcode = 'P0001';
  end if;
  if p_date_of_birth is null or p_date_of_birth > current_date then
    raise exception 'A valid date of birth is required.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from children
    where id = p_child_id and customer_id = p_customer_id
  ) then
    raise exception 'Child was not found for this customer.' using errcode = 'P0001';
  end if;

  update customers
  set name = v_parent_name,
      address = nullif(trim(coalesce(p_address, '')), '')
  where id = p_customer_id;

  update children
  set name = v_child_name,
      date_of_birth = p_date_of_birth,
      allergies = nullif(trim(coalesce(p_allergies, '')), ''),
      medical_conditions = nullif(trim(coalesce(p_medical_conditions, '')), ''),
      special_instructions = nullif(trim(coalesce(p_special_instructions, '')), '')
  where id = p_child_id and customer_id = p_customer_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function admin_update_customer_child_details(uuid, uuid, text, text, date, text, text, text, text) to authenticated;

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

  -- Keep historical registration rows, but detach references that would
  -- otherwise block the customer deletion or cascade away the audit trail.
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