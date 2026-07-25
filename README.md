# Qureocity Check-in & Ops — v0.1

## Vulnerabilities found in the original spec, and how they're fixed here

| # | Vulnerability | Fix in this build |
|---|---|---|
| 1 | RLS can't actually enforce "exact phone match" — a permissive-enough policy for that also lets anon read the *whole* `customers`/`children` tables | Anon has **zero** direct grants on `customers`, `children`, `play_sessions`. Every read/write goes through `SECURITY DEFINER` RPCs (`checkin_lookup`, `checkin_register`, `checkin_create_sessions`) that return only the one matching record. |
| 2 | Phone-number lookup could be hammered to enumerate every customer in the DB | `check_rate_limit()` — a tiny, self-pruning table, no external service — throttles lookups/registrations/session-creates per device (see "no OTP" note below). |
| 3 | `play_sessions` had no RLS at all in the original spec | RLS enabled; anon has no direct access; staff/admin can read via policy; writes only through the RPC, which verifies every `child_id` actually belongs to the `customer_id` in that same request. |
| 4 | Static QR "anti-spoofing" doesn't stop replay (photo of the code used remotely) | Documented as a known Phase-1 limitation in `PunchInFlow.tsx`; the swap point for a rotating/signed token is marked clearly for when the dedicated desk screen ships. |
| 5 | `status` / `role` as free text | Converted to Postgres enums + a `date_of_birth` column instead of a drifting `age` int. |
| 6 | No cap on "Add another child" | Capped at 10 both in the UI and with a DB trigger (`enforce_child_limit`), so the limit holds even if someone calls the RPC directly. |
| 7 | Unclear behavior for "unlimited" duration in the color-coded floor view | Modeled explicitly: `duration_mins`/`end_time` are `NULL`, and the UI shows a distinct blue "Unlimited" state instead of forcing it into green/yellow/red. |
| 8 | No employee-creation guard beyond "the UI hides the button" | `app/admin/actions.ts` re-checks the caller is an authenticated admin server-side before ever touching the `service_role` client — a hidden button is not a security boundary. |

**On skipping OTP:** agreed — since front-desk staff visually confirm the parent physically checking in, a stranger who guesses/knows a phone number still can't do anything without walking up to the desk in front of a staff member, which is a real-world control OTP would mostly duplicate at the cost of speed. The rate limiter above still guards against the actually-remote threat: a bot or script hammering the endpoint with no one physically present.

## Performance choices (kept deliberately cheap)

- Phone lookup is a single query against a `UNIQUE` btree index (`customers.phone`) — near-instant regardless of table size.
- The live floor view only ever queries `WHERE status = 'active'`, backed by a **partial index**, so it stays fast and small forever even as years of history pile up in `play_sessions`.
- Admin dashboard uses Supabase **Realtime** (Postgres change feed) instead of polling — no repeated queries, and RLS still governs who can subscribe.
- Rate-limit table is `UNLOGGED` and prunes itself opportunistically — no cron job, negligible storage.
- `end_time` is a **generated column** (`start_time + duration`), so overdue/color logic is one comparison, not app-side math.

## What I need from you to actually wire this up

1. **A Supabase project** — its Project URL and `anon` public key (Settings → API). These are safe to hand over/paste into `.env.local`, they're meant to be public.
2. The **`service_role` key** — please put this directly into your Vercel/local environment variables yourself rather than pasting it in chat; it bypasses every RLS rule and should never travel through anywhere else.
3. Confirmation of **Public Sign-ups disabled** in Supabase Auth settings (Authentication → Settings) — the schema assumes this.
4. Run `supabase/migrations/0001_init.sql` against your project (via the SQL editor or `supabase db push`).
5. Your actual brand colors from qureocity.com (hex codes) — `tailwind.config.ts` currently has placeholder colors (`brand.sun`, `brand.sky`, `brand.coral`, `brand.leaf`, `brand.ink`, `brand.cloud`) ready to be swapped in one place.
6. `npm install` then `npm run dev` once `.env.local` is filled in from `.env.example`.

## Not yet built (say the word and I'll do these next)

- ~~Admin checkout action + auto-expiry~~ ✅ done — see below
- ~~Admin-side password reset~~ ✅ done — "Reset password" button per row in the staff table (`app/admin/actions.ts` → `resetEmployeePassword`)
- Rotating/signed desk QR for Phase 2, once the dedicated screen is in — see cost breakdown below

### Checkout + auto-expiry (migration `0002_checkout_and_cron.sql`)

- **Manual checkout**: each Live Floor View card now has a "Check out" button → calls `checkout_session(session_id)`. It's a plain RLS-authorized update (not a bypass), it just validates the session is still active before closing it. Realtime picks up the change automatically — no manual state wiring needed on the client.
- **Auto-expiry**: `expire_overdue_sessions()` marks anything 4+ hours past its `end_time` as `expired`. Two ways to schedule it, pick one:
  - **Option A — pg_cron (recommended, $0, simplest)**: enable the `pg_cron` extension in Supabase (Database → Extensions, one click, included on every plan), then run the three commented-out lines at the bottom of `0002_checkout_and_cron.sql`. Runs entirely inside Postgres, nothing else to host or pay for.
  - **Option B — Vercel Cron**: `app/api/cron/expire-sessions/route.ts` + `vercel.json` (already included). Vercel's cron feature is included on Hobby/Pro, not a paid add-on — just set `CRON_SECRET` in your env vars and it's live. Use this only if you'd rather not touch Postgres extensions.

## Rotating QR for punch in/out — what it actually costs

**Short answer: effectively $0 in software/service cost.** It's not a paid feature or third-party API — it's a signed, time-boxed token your own backend generates and your own screen displays. There's no OTP-style per-scan fee because nothing leaves your infrastructure.

What it takes:
1. **A tiny endpoint** that generates a token every 30–60s: `HMAC(secret, timestamp)`, or a short-lived JWT. Free — a few lines in an Edge Function or API route, same pattern already in this codebase.
2. **The desk screen** polls/refreshes that endpoint and renders the QR client-side (`qrcode` npm package, free, tiny).
3. **The scan-side check** (in `PunchInFlow.tsx`, already stubbed) verifies the signature and that the timestamp is within the accepted window, plus checks a small "already used" table (same pattern as the rate-limit table) so the same token can't be replayed twice within its own window. All free, all inside what you already have.
4. Optional, still free: a GPS/geofence check via the browser's Geolocation API as a second signal, so the phone has to actually report being near the venue.

**The only real cost is hardware for "a dedicated screen"** — a tablet, an old phone, or a small monitor + mini PC sitting at the front desk running a browser tab in kiosk mode. Budget 8–10" Android tablets in India currently start around **₹10,000 and below** for basic models, up to ₹15–20k for something faster/more reliable long-term (prices from a July 2026 check — worth a quick look at current listings when you're ready to buy, since these shift). If you already have a spare tablet/old phone on-site, this is a $0 change entirely — just new software on hardware you own.

I can build the rotating-QR generator + the desk-display page + the scan-side signature check whenever you want — happy to do it now if you'd rather not wait for the dedicated screen (it'll just run in kiosk mode in a browser tab in the meantime, no purchase required to start).

## Front-desk QR: static/dynamic toggle (migration `0003_qr_mode_setting.sql`)

Added an admin control (Settings panel on `/admin`) to switch between:
- **Static** (default) — the current fixed code, works today.
- **Dynamic** — reserved for the rotating signed-token approach. Not implemented yet on purpose (you asked to hold off), but the plumbing is in place: an `app_settings.qr_mode` row, an admin-only toggle, and a desk display page (`/desk`) that already branches on it. Toggling to "dynamic" today just shows a "not built yet, falling back to static" notice — nothing breaks.
- The one function to fill in later is `getDynamicQrValue()` in `components/desk/DeskQrDisplay.tsx` — it's commented with exactly what to replace it with. The matching check on the scan side is marked the same way in `components/employee/PunchInFlow.tsx`.

## About the credentials you shared

Wired `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` into `.env.local` for you (these are meant to be public — safe as shared). Two things to know:
- This sandbox can't reach `supabase.co` (network here is locked to a small allowlist for npm/GitHub/etc.), so I can't run the migrations against your project myself — please run `0001_init.sql`, `0002_checkout_and_cron.sql`, and `0003_qr_mode_setting.sql` in order via the Supabase SQL editor (or `supabase db push` locally).
- `.env.local` is in `.gitignore` — still add `SUPABASE_SERVICE_ROLE_KEY` yourself rather than pasting it anywhere in chat.
