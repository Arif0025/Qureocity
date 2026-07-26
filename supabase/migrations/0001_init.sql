-- =====================================================================
-- Qureocity Check-in & Operations — Core schema + security fixes
-- =====================================================================
-- Design principle for this whole file:
--   The anon (public, unauthenticated) role NEVER gets direct SELECT/
--   INSERT/UPDATE grants on customers, children, or play_sessions.
--   Every customer-facing action goes through a SECURITY DEFINER
--   function that we control precisely — that's the only place
--   "exact phone match" or "rate limit" can actually be enforced,
--   since RLS policies can't see arbitrary client-side filters.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums (replaces free-text status/role columns from the original spec
-- — typos there would silently break the live floor view / permissions)
-- ---------------------------------------------------------------------
create type session_status as enum ('active', 'completed', 'expired');
create type employee_role as enum ('staff', 'admin');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table customers (
  id          uuid primary key default gen_random_uuid(),
  phone       text unique not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- normalized phone format enforced so lookups are always a clean index hit
alter table customers
  add constraint customers_phone_format check (phone ~ '^[0-9]{10,15}$');

create table children (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  name         text not null,
  date_of_birth date not null, -- stored as DOB, not a drifting "age" int
  created_at   timestamptz not null default now()
);

create index idx_children_customer_id on children(customer_id);

-- cap dynamic "add another child" abuse at the DB level, not just the UI
create or replace function enforce_child_limit()
returns trigger as $$
begin
  if (select count(*) from children where customer_id = new.customer_id) >= 10 then
    raise exception 'Maximum of 10 children per account';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_child_limit
  before insert on children
  for each row execute function enforce_child_limit();

create table play_sessions (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references children(id) on delete cascade,
  start_time    timestamptz not null default now(),
  duration_mins int, -- NULL = unlimited session (handled explicitly in UI, see notes)
  -- Plain column, NOT a generated one: Postgres marks `timestamptz + interval`
  -- STABLE (not IMMUTABLE) even for simple minute-based intervals, because
  -- the operator doesn't special-case "no DST-affecting units" — so a
  -- STORED generated column here is rejected outright (42P17). A
  -- BEFORE INSERT trigger computes it instead; triggers aren't held to
  -- the immutability requirement.
  end_time      timestamptz,
  status        session_status not null default 'active',
  created_at    timestamptz not null default now()
);

create or replace function compute_play_session_end_time()
returns trigger as $$
begin
  if new.duration_mins is null then
    new.end_time := null;
  else
    new.end_time := new.start_time + (new.duration_mins || ' minutes')::interval;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_play_session_end_time
  before insert on play_sessions
  for each row execute function compute_play_session_end_time();

-- Live floor view only ever queries WHERE status = 'active' — partial
-- index keeps this tiny (closed sessions don't bloat it) and near-instant
-- even as attendance_logs/play_sessions history grows over years.
create index idx_play_sessions_active on play_sessions(end_time) where status = 'active';
create index idx_play_sessions_child on play_sessions(child_id);

create table employees (
  id     uuid primary key references auth.users(id) on delete cascade,
  name   text not null,
  role   employee_role not null default 'staff',
  created_at timestamptz not null default now()
);

create table attendance_logs (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  punch_in    timestamptz not null default now(),
  punch_out   timestamptz
);

create index idx_attendance_employee on attendance_logs(employee_id, punch_in desc);

-- ---------------------------------------------------------------------
-- Rate limiting (replaces OTP as the anti-abuse control)
-- ---------------------------------------------------------------------
-- We are intentionally NOT adding OTP — front-desk staff visually confirm
-- the parent is present, which is the real-world control. What we DO
-- still need is protection against a phone left open / a bot hammering
-- the lookup endpoint to enumerate the customers table one guess at a
-- time. This table is tiny and self-pruning, so it costs ~nothing in
-- storage or query time.
create unlogged table checkin_rate_limit (
  bucket_key   text not null,     -- hashed client identifier (see RPC below)
  attempted_at timestamptz not null default now()
);
create index idx_rate_limit_key_time on checkin_rate_limit(bucket_key, attempted_at desc);

-- Cheap, no cron needed: prune anything older than 10 minutes opportunistically
create or replace function prune_rate_limit() returns void as $$
begin
  delete from checkin_rate_limit where attempted_at < now() - interval '10 minutes';
end;
$$ language plpgsql;

create or replace function check_rate_limit(p_bucket_key text, p_max_attempts int, p_window_seconds int)
returns boolean as $$
declare
  attempt_count int;
begin
  perform prune_rate_limit();

  select count(*) into attempt_count
  from checkin_rate_limit
  where bucket_key = p_bucket_key
    and attempted_at > now() - (p_window_seconds || ' seconds')::interval;

  if attempt_count >= p_max_attempts then
    return false;
  end if;

  insert into checkin_rate_limit (bucket_key) values (p_bucket_key);
  return true;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- Row Level Security — default deny on everything
-- ---------------------------------------------------------------------
alter table customers        enable row level security;
alter table children         enable row level security;
alter table play_sessions    enable row level security;
alter table employees        enable row level security;
alter table attendance_logs  enable row level security;

-- No policies created for anon/public on customers, children, or
-- play_sessions — that's the point. Direct REST access to these tables
-- returns zero rows for anon no matter what filter the client sends.
-- All customer-facing reads/writes happen through the RPCs below.

-- Staff/admin (authenticated) can read everything needed for the floor
-- view and staff table:
create policy "staff can read customers" on customers
  for select to authenticated using (
    exists (select 1 from employees e where e.id = auth.uid())
  );

create policy "staff can read children" on children
  for select to authenticated using (
    exists (select 1 from employees e where e.id = auth.uid())
  );

create policy "staff can read sessions" on play_sessions
  for select to authenticated using (
    exists (select 1 from employees e where e.id = auth.uid())
  );

create policy "staff can update sessions" on play_sessions
  for update to authenticated using (
    exists (select 1 from employees e where e.id = auth.uid())
  );

create policy "staff can read own employee row, admin reads all" on employees
  for select to authenticated using (
    id = auth.uid()
    or exists (select 1 from employees a where a.id = auth.uid() and a.role = 'admin')
  );

create policy "staff can punch themselves in" on attendance_logs
  for insert to authenticated with check (employee_id = auth.uid());

create policy "staff can close their own open punch" on attendance_logs
  for update to authenticated using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

create policy "admin/staff can read attendance" on attendance_logs
  for select to authenticated using (
    exists (select 1 from employees e where e.id = auth.uid())
  );

-- Nobody (not even authenticated staff) gets direct INSERT on employees —
-- that table is only ever written by the service_role via the Server
-- Action, which is how "public sign-up disabled, admin-only creation"
-- from the original spec is actually enforced.

-- ---------------------------------------------------------------------
-- RPC: phone lookup (the fix for the enumeration vulnerability)
-- ---------------------------------------------------------------------
-- SECURITY DEFINER bypasses RLS deliberately, but only returns the
-- single matching row (or nothing) and only the fields the check-in
-- screen needs — never a list, never other customers' data.
create or replace function checkin_lookup(p_phone text, p_client_key text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer customers;
  v_children json;
begin
  if not check_rate_limit('lookup:' || p_client_key, 8, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  select * into v_customer from customers where phone = p_phone;

  if v_customer.id is null then
    return json_build_object('found', false);
  end if;

  select json_agg(json_build_object(
           'id', c.id,
           'name', c.name,
           'age', date_part('year', age(current_date, c.date_of_birth))
         ))
  into v_children
  from children c
  where c.customer_id = v_customer.id;

  return json_build_object(
    'found', true,
    'customer_id', v_customer.id,
    'parent_name', v_customer.name,
    'children', coalesce(v_children, '[]'::json)
  );
end;
$$;

revoke all on function checkin_lookup(text, text) from public;
grant execute on function checkin_lookup(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- RPC: register a new customer + their children in one atomic call
-- ---------------------------------------------------------------------
create or replace function checkin_register(
  p_phone text,
  p_parent_name text,
  p_children json, -- [{ "name": "...", "date_of_birth": "YYYY-MM-DD" }, ...]
  p_client_key text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_child json;
begin
  if not check_rate_limit('register:' || p_client_key, 5, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from customers where phone = p_phone) then
    raise exception 'This phone number is already registered. Please use the lookup instead.';
  end if;

  if json_array_length(p_children) < 1 or json_array_length(p_children) > 10 then
    raise exception 'Please add between 1 and 10 children.';
  end if;

  insert into customers (phone, name) values (p_phone, p_parent_name)
  returning id into v_customer_id;

  for v_child in select * from json_array_elements(p_children)
  loop
    insert into children (customer_id, name, date_of_birth)
    values (
      v_customer_id,
      v_child->>'name',
      (v_child->>'date_of_birth')::date
    );
  end loop;

  return json_build_object(
    'found', true,
    'customer_id', v_customer_id,
    'children', (
      select json_agg(json_build_object(
               'id', c.id,
               'name', c.name,
               'age', date_part('year', age(current_date, c.date_of_birth))
             ))
      from children c where c.customer_id = v_customer_id
    )
  );
end;
$$;

revoke all on function checkin_register(text, text, json, text) from public;
grant execute on function checkin_register(text, text, json, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- RPC: create play sessions for the selected children
-- ---------------------------------------------------------------------
-- Validates that every child_id actually belongs to the customer_id
-- provided in the SAME call (the customer_id just came from
-- checkin_lookup/checkin_register in this same visit) — this is the
-- check that stops someone from checking a stranger's child_id in by
-- guessing/incrementing UUIDs, even without login.
create or replace function checkin_create_sessions(
  p_customer_id uuid,
  p_child_ids uuid[],
  p_duration_mins int, -- NULL = unlimited
  p_client_key text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad_count int;
  v_sessions json;
begin
  if not check_rate_limit('session:' || p_client_key, 10, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_bad_count
  from unnest(p_child_ids) as cid
  where not exists (
    select 1 from children c where c.id = cid and c.customer_id = p_customer_id
  );

  if v_bad_count > 0 then
    raise exception 'One or more selected children could not be verified.';
  end if;

  if p_duration_mins is not null and p_duration_mins not in (60, 120) then
    raise exception 'Invalid duration.';
  end if;

  with inserted as (
    insert into play_sessions (child_id, duration_mins)
    select cid, p_duration_mins from unnest(p_child_ids) as cid
    returning id, child_id, start_time, end_time
  )
  select json_agg(json_build_object(
           'session_id', i.id,
           'child_id', i.child_id,
           'start_time', i.start_time,
           'end_time', i.end_time
         ))
  into v_sessions
  from inserted i;

  return json_build_object('sessions', v_sessions);
end;
$$;

revoke all on function checkin_create_sessions(uuid, uuid[], int, text) from public;
grant execute on function checkin_create_sessions(uuid, uuid[], int, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
-- Lets the admin dashboard subscribe to changes instead of polling.
-- The existing RLS policy ("staff can read sessions") still governs who
-- is allowed to receive these events — anon is not on this publication's
-- allowed-read list for this table, so customers' devices can't listen in.
alter publication supabase_realtime add table play_sessions;

-- ---------------------------------------------------------------------
-- Housekeeping: auto-expire overdue sessions cheaply
-- ---------------------------------------------------------------------
-- Run on a schedule (pg_cron, or a Vercel cron hitting a tiny route)
-- every few minutes. Keeps the "active" partial index small and keeps
-- the admin dashboard's red/yellow/green math trivial (no need to
-- special-case "overdue but still marked active").
create or replace function expire_overdue_sessions() returns void as $$
begin
  update play_sessions
  set status = 'expired'
  where status = 'active'
    and end_time is not null
    and end_time < now() - interval '4 hours'; -- grace period before auto-expiry
end;
$$ language plpgsql security definer;
