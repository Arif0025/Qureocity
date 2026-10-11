create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check (event_key in (
    'customer_contact', 'membership_expiry', 'membership_approved', 'membership_declined',
    'special_day_approved', 'special_day_declined', 'party_approved',
    'party_declined', 'party_quote', 'birthday_outreach', 'child_checkout_push'
  )),
  name text not null check (char_length(trim(name)) between 1 and 80),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  is_default boolean not null default false,
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists message_templates_event_name_uq
  on public.message_templates (event_key, lower(name));
create unique index if not exists message_templates_one_default_uq
  on public.message_templates (event_key) where is_default and is_active;
create index if not exists message_templates_event_active_idx
  on public.message_templates (event_key, is_active, is_default desc);

alter table public.message_templates enable row level security;
drop policy if exists "staff can read message templates" on public.message_templates;
create policy "staff can read message templates" on public.message_templates
  for select to authenticated using (is_staff_member());
drop policy if exists "admins can manage message templates" on public.message_templates;
create policy "admins can manage message templates" on public.message_templates
  for all to authenticated using (is_admin_member()) with check (is_admin_member());

grant select on public.message_templates to authenticated;
grant insert, update, delete on public.message_templates to authenticated;

create or replace function public.admin_save_message_template(
  p_id uuid,
  p_event_key text,
  p_name text,
  p_body text,
  p_make_default boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  saved public.message_templates;
begin
  if not is_admin_member() then
    raise exception 'Only admins can manage message formats.' using errcode = '42501';
  end if;
  if p_event_key not in (
    'customer_contact', 'membership_expiry', 'membership_approved', 'membership_declined',
    'special_day_approved', 'special_day_declined', 'party_approved',
    'party_declined', 'party_quote', 'birthday_outreach', 'child_checkout_push'
  ) then
    raise exception 'Unknown message format category.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 80
     or char_length(trim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Enter a format name and a message of up to 2000 characters.' using errcode = '22023';
  end if;

  if coalesce(p_make_default, false) then
    update public.message_templates set is_default = false
      where event_key = p_event_key and is_default;
  end if;

  if p_id is null then
    insert into public.message_templates (event_key, name, body, is_default, updated_by, updated_at)
    values (p_event_key, trim(p_name), trim(p_body), coalesce(p_make_default, false), auth.uid(), now())
    returning * into saved;
  else
    update public.message_templates
      set name = trim(p_name), body = trim(p_body),
          is_default = coalesce(p_make_default, false), updated_by = auth.uid(), updated_at = now()
      where id = p_id and event_key = p_event_key and is_active
      returning * into saved;
    if saved.id is null then
      raise exception 'Message format not found.' using errcode = 'P0002';
    end if;
  end if;
  return to_jsonb(saved);
end;
$$;

revoke all on function public.admin_save_message_template(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.admin_save_message_template(uuid, text, text, text, boolean) to authenticated;

insert into public.message_templates (event_key, name, body, is_default) values
  ('customer_contact', 'Customer greeting', 'Hi {{parent_name}}! This is {{business_name}}. How can we help you today?', true),
  ('membership_expiry', 'Membership expiry reminder', 'Hi {{parent_name}}! Just a heads up that {{child_name}}''s membership at {{business_name}} expires on {{expiry_date}}. Renew anytime at the front desk to keep the fun going! 🎉', true),
  ('membership_approved', 'Membership approved', 'Hi {{parent_name}}, {{child_name}}''s {{plan_name}} has been approved and their subscription is now active. We look forward to welcoming you!', true),
  ('membership_declined', 'We’re unavailable', 'Hi {{parent_name}}, unfortunately we’re unable to approve {{child_name}}''s {{request_type}} request at this time. Please contact us if you have any questions.', true),
  ('membership_declined', 'Please reschedule', 'Hi {{parent_name}}, could we arrange another time for {{child_name}}''s {{request_type}}? Please reply so we can help.', false),
  ('special_day_approved', 'Special day approved', 'Hi {{parent_name}}, {{child_name}}''s registration for {{plan_name}} on {{event_date}} is confirmed. We look forward to welcoming you!', true),
  ('special_day_declined', 'We’re unavailable', 'Hi {{parent_name}}, unfortunately we’re unable to approve {{child_name}}''s {{request_type}} request for {{event_date}}. Please contact us if you have questions.', true),
  ('special_day_declined', 'Please reschedule', 'Hi {{parent_name}}, could we arrange a different date for {{child_name}}''s {{plan_name}}? Please reply so we can help.', false),
  ('party_approved', 'Party approved', 'Hi {{parent_name}}, {{child_name}}''s party booking for {{plan_name}} is approved for {{party_datetime}}. We look forward to celebrating with you!', true),
  ('party_declined', 'We’re unavailable', 'Hi {{parent_name}}, unfortunately we’re unable to host {{child_name}}''s party on {{party_datetime}}. Please reply if you would like to discuss another date or have any questions.', true),
  ('party_declined', 'Please reschedule', 'Hi {{parent_name}}, could we arrange a different time for {{child_name}}''s party? Please reply so we can help you reschedule.', false),
  ('party_quote', 'Party quote', 'Hi {{parent_name}}, we have prepared a quote of {{quote_amount}} for {{child_name}}''s party request. Requested start: {{party_datetime}}. Please reply if you would like to discuss or confirm it.', true),
  ('birthday_outreach', 'Birthday invitation', 'Hi {{parent_name}}, {{child_name}}''s birthday is coming up on {{birthday_date}}. We''d love to help you plan a fun celebration at {{business_name}}. Reply here if you''d like to hear about our party options!', true),
  ('child_checkout_push', 'Checkout message', 'Hi {{parent_name}}! This is {{business_name}} — {{child_name}} has finished today''s visit. Let us know if you need anything.', true)
on conflict do nothing;
