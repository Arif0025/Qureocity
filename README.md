# QureoCity

QureoCity is a mobile-friendly venue management app for customer records, child check-ins, memberships, party bookings, staff attendance, and notifications. Admins manage the venue; employees use a focused daily-work view; families register and check in through the public kiosk.

## Roles and workflows

### Admin

- **Overview:** daily check-in summary, children currently on site, team attendance, and monthly activity.
- **Customers:** search and browse family/child records, filter active memberships and plans, view history, add customers, and contact parents.
- **Plans:** create and manage membership, special-day, and party plans; share or display special-day QR codes. Party settings are managed in the party-plans area.
- **Notifications:** review membership, special-day, and party registrations; approve or decline requests, prepare messages, and review confirmed/upcoming parties. Birthday and membership-expiry outreach is available where records qualify.
- **Staff:** manage employees, shifts, attendance and punch records, salary settings/calculations, and staff notifications.
- **Settings:** configure desk/kiosk access, notification rules and message templates, account/password and appearance settings. Export selected data groups or a full backup from the admin export control.

### Employee

The employee panel provides **Home**, **Customers**, **Attendance**, and **Settings**. Employees can scan the desk QR code to punch in/out, check children in or out, search customer records, see their attendance/shift details, and manage their own notification and account preferences. Admin-only management and messaging actions stay restricted to admins.

### Family check-in (`/checkin`)

The public check-in flow supports walk-ins, new or returning families, membership registration and renewal, special-day passes, and party bookings. Party bookings use a separate flow: select a package or request a custom party, provide the requested date/time and contact details, then submit for admin review. A submitted party request is not confirmed until approved.

### Front desk (`/desk`)

Displays the rotating employee punch QR when dynamic desk mode is enabled. The kiosk and QR access are configured by an admin in Settings.

## Local development

1. Install the project’s Node.js dependencies with `npm install` (use `npm ci` for a lockfile-exact install).
2. Copy `.env.example` to `.env.local` and fill in the values described below.
3. Apply the SQL migrations in `supabase/migrations/` to the Supabase project, in filename order.
4. Start the app with `npm run dev` and open [http://localhost:3000](http://localhost:3000).

Useful scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run lint` | ESLint checks |
| `npm run build` | Production build |
| `npm run start` | Serve a completed production build locally |

## Environment variables

See `.env.example` for the full list. Required values include:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project URL and public client key.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase admin access for employee account creation. Never expose this with a `NEXT_PUBLIC_` prefix.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` — browser push notifications. Generate a matching key pair with `npx web-push generate-vapid-keys`; keep the private key server-only.
- `NEXT_PUBLIC_DESK_QR_VALUE` and `QR_SIGNING_SECRET` — desk punch QR configuration.
- `CRON_SECRET` — only if using the Vercel cron endpoint as the fallback for the database scheduled job.

## Deployment workflow

1. Apply any new Supabase migrations to the target database, in order, before deploying code that depends on them.
2. Set environment variables in Vercel for the intended environment. Preview and Production have separate values; the VAPID public key is included in the client build, so redeploy after changing push keys.
3. Deploy and check the build output and Vercel function logs. Use a Preview deployment to verify login, role access, check-in, party request/review, and push notification setup before promoting to Production.
4. The configured Vercel cron runs `/api/cron/expire-sessions` daily. If the database cron is used instead, `CRON_SECRET` is only needed for the Vercel fallback.

Keep `.env.local`, service-role keys, VAPID private keys, and signing secrets out of source control. `.env.example` contains names and placeholders, not deployable secrets.
