-- =====================================================================
-- Migration 2: manual checkout + auto-expiry wiring
-- =====================================================================

alter table play_sessions add column ended_at timestamptz;

-- ---------------------------------------------------------------------
-- Manual checkout (front desk marks a child as picked up / done playing)
-- ---------------------------------------------------------------------
-- Deliberately SECURITY INVOKER (the default) — it runs as the calling
-- employee, so the existing "staff can update sessions" RLS policy is
-- what actually authorizes this, not a bypass. The function just adds
-- the validation (must currently be active) and keeps the call a single
-- round trip from the client instead of a raw .update() the UI would
-- otherwise have to get right every time.
create or replace function checkout_session(p_session_id uuid)
returns void
language plpgsql
as $$
declare
  v_rows int;
begin
  update play_sessions
  set status = 'completed', ended_at = now()
  where id = p_session_id and status = 'active';

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Session was already closed or does not exist.';
  end if;
end;
$$;

revoke all on function checkout_session(uuid) from public;
grant execute on function checkout_session(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Auto-expiry: record ended_at too, so "expired" sessions have the same
-- shape as manually-completed ones for any later reporting
-- ---------------------------------------------------------------------
create or replace function expire_overdue_sessions() returns void as $$
begin
  update play_sessions
  set status = 'expired', ended_at = now()
  where status = 'active'
    and end_time is not null
    and end_time < now() - interval '4 hours'; -- grace period before auto-expiry
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- Scheduling option A (recommended, $0, no extra hosting): pg_cron
-- ---------------------------------------------------------------------
-- Supabase ships the pg_cron extension for free on every plan (enable it
-- once under Database → Extensions in the dashboard, or run the line
-- below if your project already has it enabled). This runs entirely
-- inside Postgres — no Edge Function, no Vercel Cron, nothing to pay for.
--
-- create extension if not exists pg_cron;
-- select cron.schedule(
--   'expire-overdue-sessions',
--   '*/5 * * * *', -- every 5 minutes
--   $$select expire_overdue_sessions()$$
-- );
--
-- Left commented out here rather than run automatically, since enabling
-- an extension is a one-time dashboard/project decision you should make
-- deliberately. Uncomment and run once pg_cron is enabled.

grant execute on function expire_overdue_sessions() to service_role;
