-- =====================================================================
-- Migration 3: desk QR mode toggle (static vs dynamic)
-- =====================================================================
-- Single-row settings table. The `id boolean primary key default true`
-- + `check (id = true)` trick guarantees exactly one row can ever exist
-- — no accidental multi-row config drift.

create table app_settings (
  id      boolean primary key default true,
  qr_mode text not null default 'static' check (qr_mode in ('static', 'dynamic')),
  constraint app_settings_single_row check (id = true)
);

insert into app_settings (id) values (true);

alter table app_settings enable row level security;

-- Publicly readable: the front-desk display page isn't behind employee
-- login (it's just a screen showing a code), and "which mode are we in"
-- isn't sensitive. Only the mode value is exposed — nothing else.
create policy "anyone can read qr mode" on app_settings
  for select using (true);

-- Only admins can flip it.
create policy "admin can update qr mode" on app_settings
  for update to authenticated using (
    exists (select 1 from employees e where e.id = auth.uid() and e.role = 'admin')
  );
