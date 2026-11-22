# QureoCity Mobile App Product Scope

## Product direction

The mobile app is a dedicated native Expo application for employees and admins. Its React Native screens should closely follow the web application's visual design and workflows while adapting to mobile layouts. Do not embed the website in a WebView. The mobile app retains native session storage, authentication, notifications, camera/QR attendance, and other implemented device features.

The native app remains responsible for the launcher identity, system safe areas, Android back handling, Expo Updates, and device features. Adding native modules requires a new APK. Website UI changes must be implemented in the native app separately; only JavaScript/assets compatible with an installed binary can be delivered by OTA.

This document is the working feature inventory. Items remain in scope until the product owner removes or changes them. No product behavior is changed by this document.

## Current build progress

- The Expo app scaffold now lives in `apps/mobile`; the existing website and kiosk remain in place.
- The first screen supports staff/admin email and password sign-in, employee-role lookup, persisted mobile sessions, and role-specific signed-in states.
- The admin role opens a mobile dashboard with an admin-only aggregate for pending registrations, pending check-ins, party requests, leave requests, staff on site, children on site, and today's check-ins. It fetches counts only on dashboard entry/refresh; the matching detail rows are fetched only after a count is opened.
- The mobile requests workspace now covers registration confirmation/discard, party request approval/decline/custom quotes, paid leave decisions, recent request history, paged expired/expiring membership alerts, and paged push delivery history. Customer-directed WhatsApp drafts open only after the admin explicitly chooses an outreach action.
- The mobile team workspace now covers employee roster, monthly attendance summaries, on-duty state, standing shift assignment, salary rates, role changes, password resets, employee account creation/removal, attendance corrections, and admin force punch-in/out. Privileged employee account operations use a server-side Edge Function; its deployment and authenticated-device verification remain release prerequisites.
- Admin settings now expose the existing protected front-desk QR mode toggle, password change, kiosk password/session controls, grouped JSON data export, and native notification registration/preferences/test send. Native event delivery is wired through the existing immediate event relay to Expo Push; database schedules are removed in the applied mobile migration. Scheduled session countdown and overdue alerts are intentionally unavailable in the mobile client. The Android Firebase config file is present and the user reports uploading the FCM V1 service-account key to EAS; include both in the next APK/release setup and verify an actual device push after installation.
- Mobile screens now share palette tokens in `apps/mobile/src/theme/tokens.ts`; screen layouts remain separate so individual workflows can be redesigned without coupling their behavior.
- The mobile customer directory now supports paged search, active/expiring/expired membership filters, plan filtering, lazy child care/contact details, add-family flow, atomic parent/child/contact detail editing, customer deletion with confirmation, membership/special-pass assignment, date and remaining-visit corrections, visit history, manual check-in/out, click-to-call, and explicit WhatsApp draft opening. Consent is displayed but never changed by contact editing. Mobile contact drafts now go through a shared messaging adapter so future Meta inbox operations can be added without putting Meta API calls in screens.
- The plans workspace now supports recurring/special-day membership plan creation and editing, multi-date special plans, weekday/age/visit-limit rules, active status, party package creation/editing, member counts, and a lazily opened plan roster. Plan updates use existing admin RLS/RPC protections.
- Admin navigation now includes a global search overlay for admin sections, families/children/phone numbers, and employee names. Customer search is debounced and capped to six matches; employee names are loaded only when search is used. Selecting a customer opens the paged directory at that query; selecting an employee opens the matching team record.
- Party booking availability settings are available in the Party plans tab, using the existing `app_settings` values for venue opening/closing times and the 60/90/120-minute reset gap.
- The Admin Requests workspace is exposed as the Registration Inbox. Its registrations section shows pending registration requests; the Actions section records recent membership/renewal/special-day, party, and staff leave decisions from existing review records.
- Registration list rows now use a summary-only RPC; parent contact, address, consent, and medical/care details load for one registration only after the admin opens it. Database migration 0119 contains these admin-only RPCs and must be applied before publishing an OTA that calls them.
- Native admin review screens now include registration confirm/discard, party approval/decline/custom quote, paid leave review, recent request decisions, paged expiry/expired-member alerts, and paged push delivery history. Messaging from party/expiry screens opens a WhatsApp draft only after explicit admin action. Device verification remains part of the release validation phase.
- Migration 0118 adds the aggregate-only admin dashboard RPC, mobile push device storage/delivery, and role checks to the child-on-site and pending-check-in `SECURITY DEFINER` detail RPCs. The user reports it has been applied in the connected Supabase project; required server functions still need deployment/review.
- The staff role currently has a floor dashboard with today’s check-in totals, on-site child list, name search, countdowns, parent call links, check-out confirmation, and 30-minute/1-hour extensions for eligible active timed walk-ins. The Attendance tab includes server-validated QR punch-in/out, assigned shift details, monthly totals, a month-selectable attendance calendar, recent punch history, and leave request submission/status. Staff also have a read-only customer directory/search and password change in More. Actual-device verification remains. Extension and check-out changes use staff-authorized Supabase RPCs.
- The native app configuration includes SecureStore, Expo Notifications, OTA updates, local file sharing, Reanimated, and the Expo Camera plugin. The QR punch UI and Expo Push registration/delivery are implemented. `apps/mobile/google-services.json` is present; EAS FCM V1 key setup was reported complete. Actual remote-push verification still requires a fresh Android APK with that Firebase config.
- Direct Android APK build profiles, launch-time update checks, and a preview-only Android OTA publishing workflow are prepared. The preview Supabase URL and anon key are configured in EAS. A device crash log exposed quote characters accidentally copied into the URL value; the EAS values were corrected and a fresh Android OTA was published. The duplicate JavaScript update-fetch/reload path was also removed. The user subsequently confirmed sign-in and the admin dashboard opened successfully. The current admin workflow changes have not been published by OTA.
- The Expo project is linked to `@arif0025s-team/qureocity-staff` (project ID `bd79991c-66b1-4b72-a800-56205ceb4c16`), and EAS Update is configured.
- The first preview APK build reached native Gradle compilation but was canceled at EAS's 45-minute build limit. The Android build now targets ARMv7 and ARM64 physical devices to skip x86 emulator builds; actual-device layout and sign-in verification remain to be done.
- The mobile UI/query audit added on 2026-11-08 is recorded below. A monthly salary-history selector now fetches one employee/month summary only when selected; historical amounts are estimates using the current salary rate because salary rates are not effective-dated in the database.

## User groups and features

### Customers — website only

- Find an existing family using a phone number.
- Register a family and add child details.
- Set consent choices, including WhatsApp updates and photo consent.
- Check in a child for a visit.
- Register for or renew a membership.
- Browse and register for special-day passes or renewals.
- Request a party using a package or custom quote.
- Check party availability and receive a submission/booking confirmation.

### Employees — mobile app

- Sign in, change password, and sign out.
- See children currently checked in, today’s check-in count, and venue capacity.
- Open the full on-site list and view child/parent details.
- Check children out.
- Extend an eligible active timed walk-in session by 30 minutes or 1 hour. The staff mobile UI exposes those actions and calls the existing staff-authorized RPC. Existing database logic also supports 45 minutes, which is not exposed. Current backend restrictions exclude special-pass and active-membership sessions; decide whether to retain that rule before implementation.
- Search customer records and view membership information.
- Punch in and out for a shift.
- View assigned shift details and attendance history.
- Submit and review leave requests.
- Receive and manage notifications in the mobile app.
- Change appearance settings and view help.

### Admins — mobile app

- See the daily overview, check-in activity, monthly statistics, and children on site.
- Search customers and families; filter by membership, plan, new registrations, and expiring memberships.
- View and manage customer, child, membership, and visit records.
- Add customers, memberships, or walk-in records.
- Review membership and special-day registration requests.
- Create and manage membership and special-day plans.
- Manage party packages, availability settings, and booking requests; approve, decline, or prepare quotes.
- Add and manage employee accounts and roles.
- Create shifts; review attendance, leave, and salary information/settings.
- Configure kiosk access and QR mode; view or revoke kiosk sessions.
- Export data.
- Manage notification settings and message templates.
- Send staff notifications and customer outreach, including birthday and membership-expiry follow-up.
- Integrate WhatsApp and Instagram messaging into the admin mobile experience.
- Use an admin-only AI assistant: start with chat, then add the ability to prepare and carry out approved admin actions.
- Change account and appearance settings; view help.

### Kiosk — web

- Sign in with kiosk access.
- Display a QR code for customer check-in.
- Use the configured static or dynamic QR mode.

## Notifications and scheduled work

- No Supabase/Postgres cron jobs or database schedules in the target design.
- The mobile app owns notification permission, presentation, routing, and on-device reminders through Expo Notifications.
- New server-side events (such as a registration submitted on the website) can notify a backgrounded/closed phone through an event-driven push sender; no database schedule is needed. The app cannot discover new web events while it is suspended without OS push delivery.
- Revisit all existing time-triggered behavior (session expiry, automatic staff punch-out, session alerts, leave reminders, and data cleanup) and decide whether to remove it, calculate it when records are read, or replace it with on-device behavior. Do not silently assume scheduled behavior remains.

## Data and integrations

- Supabase is the system of record for application data.
- Keep database requests efficient: fetch only needed fields, paginate large lists, avoid duplicate reads during navigation, and use realtime subscriptions only for screens that need live updates.
- Keep privileged credentials and Meta API calls on a trusted server endpoint; never ship secrets in the mobile bundle.
- Existing WhatsApp support is contact/outreach oriented; a full WhatsApp inbox is not currently present. Instagram messaging is not currently integrated.
- Confirm the desired Meta messaging scope, account setup, retention, and consent before implementing the inbox.

### Meta integration diagnostics and verification readiness

- Keep Instagram and WhatsApp credentials, long-lived tokens, webhook verification secrets, and Graph API calls on trusted server endpoints such as Supabase Edge Functions. The mobile bundle must contain none of them. Existing contact actions should call a shared mobile messaging adapter; Meta inbox send/reply operations will use a separate server-backed provider so switching from draft links does not couple Meta credentials to UI screens.
- Give each inbound webhook delivery and outbound Graph API request a correlation ID. Persist redacted operational records with event/request type, Meta app and business asset IDs, timestamp, Graph API version, HTTP status, Meta error code/subcode, retry count, and processing outcome. Never log access tokens, full message bodies, or unmasked phone numbers.
- Add an admin integration status screen that distinguishes configuration, token validity/expiry, webhook subscription, account/phone-number linkage, required permissions, and latest successful inbound/outbound activity. Show actionable Meta error codes and correlation IDs so a failed step can be traced to its source.
- Verify with test assets first, then repeat the same documented checks against QureoCity-owned or authorized business assets. A successful send does not prove inbound webhooks or Instagram insights work.
- Before Meta access review, maintain a reproducible checklist for app mode, business verification, test users/assets, HTTPS callback and challenge verification, subscribed webhook fields, token scopes, data deletion/privacy URL, and reviewer test instructions. Keep Meta setup separate from mobile UI build progress so app defects and Meta account restrictions are not conflated.

## Admin AI assistant

- Access is limited to authenticated admin accounts; staff and customers do not see the assistant.
- Phase 1 is a conversational assistant that answers admin questions using only data and guidance the signed-in admin is authorized to access.
- Later phases may let the assistant prepare and execute specific admin actions through an explicit allowlist of application operations. Show the proposed change and require the admin to confirm consequential actions before execution.
- Keep model credentials and AI requests on a trusted server endpoint. Do not expose model API keys in the mobile app, grant the model direct database credentials, or allow it to run arbitrary SQL.
- Enforce the acting admin's permissions on every operation and keep an audit record of actions performed through the assistant.
- Decide which actions are eligible, which require confirmation, what business data the assistant may read, and how long conversation history is retained before enabling action-taking.

## UI, motion, and device compatibility

- Create a mobile-first design system before building feature screens: colors, typography, spacing, surfaces, iconography, touch targets, and motion rules.
- Design for compact devices including iPhone mini widths, as well as current large iPhones and common Android phones.
- Respect safe areas, notches, home indicators, keyboard insets, text scaling, and platform navigation conventions.
- Avoid fixed-width layouts and content that only works at one viewport size; support scrolling and compact navigation gracefully.
- Keep animation purposeful and fast: clear state changes, restrained transitions, and reduced-motion support.
- Verify key screens on both iOS and Android across representative older/current OS versions and compact/large screen sizes before adding the next feature.

## Android rollout and app updates

- Begin Android distribution with signed APKs shared directly with staff; Play Store publication is not required for internal rollout.
- Use Expo EAS Build for preview/internal APKs and EAS Update for compatible JavaScript, styling, and asset changes.
- Configure the app to check for compatible updates when it launches. Devices receive the update on launch/reload, not while the app is closed.
- Use app-version runtime compatibility so an update requiring a new native module cannot be installed on an APK that lacks it. Native capability/configuration changes require bumping the app version and Android version code, then building a replacement APK.
- Before publishing OTA updates from GitHub Actions, add an Expo access token as the repository's `EXPO_TOKEN` secret. Never commit or share the token in chat.

## Suggested delivery sequence

1. Create a separate Expo + React Native + TypeScript app in `apps/mobile`, keeping the existing Next.js website and kiosk in place.
2. Build sign-in first using the existing staff account system: Supabase Auth, encrypted persisted mobile sessions, employee role lookup, and role-based routing to staff or admin screens. Do not add customer self-registration to the mobile app.
3. Prepare direct Android APK distribution and compatible OTA updates; link the app to Expo EAS before the first APK is built.
4. Build the authenticated staff/admin app shell, navigation, compact design system, and role-specific landing screens; validate session restore and layout on compact and large devices. Both admin and staff landing dashboards are implemented; actual-device verification of the staff screen and its visit actions remains.
5. Implement the employee floor workflow, including QR shift punch, live check-ins/outs, and the session-extension action.
6. Add attendance, shifts, and leave; then add admin operations in small, reviewable slices.
7. Add the admin AI chat, then expand it to explicitly approved actions after the core admin operations are stable.
8. Add notification behavior and Meta messaging after the core mobile workflows are stable.
9. Keep customer registration/renewal and the kiosk on the website unless scope is explicitly changed.

## Admin web-to-mobile migration phases

### Efficiency, parity, and release audit — 2026-11-08

**Query behavior checked**

- Admin overview loads one aggregate RPC on entry/refresh. Child, staff, check-in, and detailed pending-request rows are fetched only after a tile is opened. No row-level customer data is part of the overview RPC.
- Customer search is paged. Child care/contact data and visit history are loaded after expanding a family/child or choosing history. Plan lists are loaded only when the plan screen/filter is opened. These are intentional reads for the displayed UI.
- Admin staff loads the employee roster, up to 100 shifts, current-month attendance aggregates, open-punch employee IDs, and venue attendance settings together because those fields appear in the roster/settings view. The 60-record individual attendance history is fetched only when an employee is opened. Past salary-month aggregates are fetched only on month selection. The RPC is scoped to one employee and one month.
- Staff floor view loads the on-site child list and today's count because both are visible. Realtime play-session events refresh that snapshot; refreshes are now coalesced over 300 ms to avoid repeated requests during a burst of related row changes. Search is local over the already-rendered on-site list.
- Admin request history, expiry alerts, push history, and customer result sets are paged/capped where implemented. The registration list over-fetch was fixed in mobile code using summary and single-request detail RPCs; migration 0119 must be applied before this mobile version is published. The older `list_pending_registrations()` remains unchanged for existing web clients.
- The admin dashboard's pending detail drilldown currently caps direct table queues at 100 rows; if any queue can exceed that, add paging rather than increasing the cap. The staff team shift query is capped at 100; confirm the maximum roster size or paginate it.

**Web feature parity gaps still visible**

- Admin: web help; notification tap-through routing to the exact request/action; saved message templates; birthday outreach; richer dashboard activity/monthly analytics and upcoming/special-day views; full WhatsApp inbox and Instagram inbox/post insights. The mobile customer WhatsApp action is currently a user-reviewed draft, not a Meta API send. Admin AI is not implemented yet.
- Employee: web help; theme/appearance control; notification tap-through routing. Core floor actions, attendance calendar, customer directory/search, password change, leave, QR punch, and extensions are present.
- Customer registration/renewals and kiosk remain website workflows by product decision. They are intentionally not mobile-app parity gaps.
- Previous-month salary is displayed as an estimate from attendance and the employee's current salary rate. The database has no salary-rate history/payroll snapshots, so it cannot accurately represent finalized historical pay after a rate change. A true payroll history requires effective-dated salary records or monthly payroll snapshots and an approved migration.

**OTA/build boundary**

- Screen layout, colors, typography, copy, navigation implemented in JavaScript, and bundled JS assets can be delivered with EAS Update while the installed APK's runtime version matches. `runtimeVersion` currently follows `appVersion`; launch-time checks are enabled and use a zero-second cache fallback.
- Native modules, Android permissions, notification/camera configuration, Firebase native config, package ID, splash/icon/native resources, and native build properties require a replacement APK. The Firebase Android file is currently included by dynamic app config when present. The first APK carrying this native push setup must be built before expecting FCM on devices.
- Keep UI assets bundled or hosted remotely; changing app icon/splash is a native build change. For OTA-safe redesigns, work in the screen components/theme tokens and avoid adding/changing native modules or config.
- `EXPO_PUBLIC_*` values are embedded in the JS bundle at publish time. Changing Supabase endpoint/anon key requires publishing a new OTA update for matching environment/channel; it does not consume an EAS build, but never place service-role or other privileged secrets in these variables.
- Before the next APK, verify preview environment values and EAS channel, confirm the current installed APK uses the preview channel/runtime, confirm FCM config/key, deploy any required Edge Functions, and then publish OTA changes only after installing that APK. Do not publish an OTA that assumes native capabilities missing from installed builds.

The current website is the behavior reference. Port its existing workflows in slices; do not duplicate the website layout mechanically. Preserve its authorization rules and business RPCs unless a security or product gap is found. Each phase gets a compact-device review before the next begins. Keep all new database changes in one unapplied mobile migration draft until the feature inventory is implemented and reviewed; apply that consolidated migration once, publish one compatible OTA update, then perform the end-to-end device test and fix any issues before another OTA.

1. **Overview and daily queues** — daily counts, pending review, staff and children on site, check-in history, lazy-loaded detail views. Implemented; the user reports migration 0118 is applied.
2. **Notifications and requests** — registration, party and leave decisions, recent history, expiry alerts, native push registration/preferences/test send, and immediate event delivery are ported. Remaining: notification tap routing and device verification. Scheduled session countdown/overdue alerts stay out of the mobile workflow.
3. **Customers and memberships** — in progress: paged search, active/expiring/expired membership filters, plan filtering, child and family contact detail editing, consent visibility, membership/special-pass assignment, membership date and visit allowance corrections, visit history, manual check-in/out, adding a family, customer deletion, click-to-call, and explicit WhatsApp drafts are ported. Remaining: saved-message template integration and compact-device verification.
4. **Plans and party setup** — in progress: recurring/special-day plan CRUD, member counts/roster, party package CRUD, and venue party availability settings are ported. Remaining: plan/member-specific corrections and compact-device verification.
5. **Team operations** — admin employee roster/account and role management, standing shift assignment, monthly attendance summaries, on-duty state, salary settings, on-demand previous-month estimated salary, attendance settings, admin force punch-in/out, and attendance corrections are ported. Employee self-service includes QR punch-in/out, assigned shift details, monthly totals, month-selectable attendance calendar, recent punch history, read-only customer search/directory, password change, and leave submission/status. Compact-device verification remains. Leave request review is available in the admin Requests workspace. Leave reminder configuration remains deferred to native mobile notifications, consistent with the decision to remove database scheduled notification jobs.
6. **Settings and mobile capabilities** — in progress: protected QR mode, password change, kiosk session/password management, grouped data export with native file sharing, sign-out, native Expo token registration, opt-in preferences, foreground display, event delivery, and test send are drafted. The user reports FCM V1 key setup is complete and the Android Firebase config file is present. Remaining: device push verification, notification tap routing, and compact-device verification. No notification cron jobs are retained in the mobile migration.
7. **Remaining general admin parity** — add web-admin capabilities not yet surfaced in the mobile app: help, notification tap-through routing, saved message templates, birthday outreach, richer dashboard analytics/overview details, and Meta inbox/insights. Global search, the registration/action inbox, and party availability settings are implemented. Keep each remaining capability in a separate mobile module backed by existing secured RPCs or Edge Functions.
8. **Integrated release validation** — the user reports migration 0118 is applied. Apply migration 0119 before the OTA that calls its registration list/detail RPCs. Deploy/review the required Edge Functions, build one APK carrying FCM native config, publish a compatible OTA, then test the migrated workflows on Android and compact/iPhone-sized layouts. Fix and recheck any failures before broadening use.
9. **Meta inbox and insights (after general admin parity)** — add WhatsApp and Instagram customer-message inboxes plus Instagram post/account insights. Keep existing draft links behind the shared messaging adapter. Implement Meta API access and webhook processing only in trusted server functions; do not block the rest of the app on Meta business verification.
10. **Admin AI** — chat first, then explicitly approved administrative actions after the mobile workflows and permissions are stable.

## Decisions to confirm

- Whether session extension applies only to timed walk-ins or to other active visit types too.
- Whether staff should have 30-minute and 1-hour options only, or also the existing 45-minute option.
- Which notifications should be local reminders versus event-driven push notifications.
- Whether the mobile app should share the existing Supabase Auth accounts or use a different sign-in model.
- Which staff/admin features are removed from this inventory before implementation.
