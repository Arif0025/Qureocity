-- Persistent, separately revocable access for front-desk kiosk browsers.

alter table app_settings
  add column if not exists kiosk_password_hash text;

create table if not exists kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table kiosk_sessions enable row level security;

revoke all on kiosk_sessions from anon, authenticated;
grant all on kiosk_sessions to service_role;