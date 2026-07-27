-- =====================================================================
-- Migration 6: add-child-on-return-visit + dynamic QR anti-replay table
-- =====================================================================

-- ---------------------------------------------------------------------
-- Let a returning family add a new child during check-in (e.g. a
-- younger sibling who wasn't registered last time). Same validation
-- and rate-limit pattern as checkin_register; the existing
-- enforce_child_limit trigger still caps it at 10 per family.
-- ---------------------------------------------------------------------
create or replace function checkin_add_child(
  p_customer_id uuid,
  p_name text,
  p_date_of_birth date,
  p_client_key text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child_id uuid;
begin
  if not check_rate_limit('addchild:' || p_client_key, 5, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from customers where id = p_customer_id) then
    raise exception 'Account not found.';
  end if;

  insert into children (customer_id, name, date_of_birth)
  values (p_customer_id, p_name, p_date_of_birth)
  returning id into v_child_id;

  return json_build_object(
    'id', v_child_id,
    'name', p_name,
    'age', date_part('year', age(current_date, p_date_of_birth))
  );
end;
$$;

revoke all on function checkin_add_child(uuid, text, date, text) from public;
grant execute on function checkin_add_child(uuid, text, date, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Dynamic QR anti-replay: same self-pruning pattern as checkin_rate_limit.
-- A token is single-use within its own validity window — once a scan
-- succeeds, its hash is recorded here so a second scan of the same
-- still-valid code (e.g. two people scanning a screen within the same
-- 45s window) is rejected.
-- ---------------------------------------------------------------------
create unlogged table used_qr_tokens (
  token_hash text primary key,
  used_at    timestamptz not null default now()
);

create or replace function prune_used_qr_tokens() returns void as $$
begin
  delete from used_qr_tokens where used_at < now() - interval '10 minutes';
end;
$$ language plpgsql;

grant select, insert on used_qr_tokens to authenticated;
