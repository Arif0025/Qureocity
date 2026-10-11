-- Party requests may have a family phone and child name but no child_id.
-- Resolve a DOB only when a staff member opens a message that uses
-- {{birthday_date}}, avoiding extra queries for ordinary messages.
create or replace function public.staff_child_dob_for_contact(p_phone text, p_child_name text)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result date;
  normalized_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if not is_staff_member() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if normalized_phone = '' or trim(coalesce(p_child_name, '')) = '' then
    return null;
  end if;
  select ch.date_of_birth into result
  from children ch
  join customers cu on cu.id = ch.customer_id
  where lower(trim(ch.name)) = lower(trim(p_child_name))
    and (
      regexp_replace(coalesce(cu.phone, ''), '[^0-9]', '', 'g') = normalized_phone
      or regexp_replace(coalesce(cu.secondary_phone, ''), '[^0-9]', '', 'g') = normalized_phone
    )
  order by ch.created_at desc
  limit 1;
  return result;
end;
$$;

revoke all on function public.staff_child_dob_for_contact(text, text) from public, anon;
grant execute on function public.staff_child_dob_for_contact(text, text) to authenticated;
