-- Admin-managed party packages are kept separate from membership plans so
-- existing membership and special-pass check-in RPCs remain unchanged.
create table if not exists party_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10, 2) not null default 0 check (price >= 0),
  kids_count integer not null default 0 check (kids_count >= 0),
  adults_count integer not null default 0 check (adults_count >= 0),
  includes_cake boolean not null default false,
  includes_snacks boolean not null default false,
  decorations_type text,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  area_type text not null default 'party_room'
    check (area_type in ('party_room', 'entire_play_area')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists party_plans_active_created_idx
  on party_plans (active desc, created_at desc);

alter table party_plans enable row level security;

create policy "anyone can read active party plans" on party_plans
  for select to anon, authenticated
  using (active = true or is_admin_member());

create policy "admin can insert party plans" on party_plans
  for insert to authenticated with check (is_admin_member());

create policy "admin can update party plans" on party_plans
  for update to authenticated
  using (is_admin_member()) with check (is_admin_member());

create policy "admin can delete party plans" on party_plans
  for delete to authenticated using (is_admin_member());

grant select on party_plans to anon;
grant select, insert, update, delete on party_plans to authenticated;
