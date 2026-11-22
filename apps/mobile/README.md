# QureoCity Mobile

Expo application that opens the live QureoCity employee/admin web application at `/employee` in a persistent native WebView. The website is the source of truth for sign-in, navigation, page layout, and workflows; role routing redirects admins to `/admin` and staff to `/employee`. Website deployments therefore update the app's UI without rebuilding the APK.

The native shell keeps the QureoCity launcher artwork, status/navigation safe areas, Android back navigation, external phone/email links, Expo Updates, and notification foreground handling. Website authentication and its Supabase session persist in WebView storage across launches. The launcher, adaptive, monochrome, splash, and favicon artwork use the existing QureoCity logo. Launcher artwork is part of the native build, so install a newly built APK to see it; Expo Go continues to use Expo Go's own app icon.

Adding `react-native-webview` changes the native binary. Expo version `1.0.2` / Android version code `3` requires a fresh APK; older `1.0.1` builds cannot receive an OTA that imports the WebView native module. After that build is installed, website-only UI changes are served by the website and do not need an Expo OTA.

## Sign-in

The app signs staff in with the existing Supabase Auth accounts, then reads that user's `employees` row to confirm access and route by `staff` or `admin` role. Session credentials and the verified staff profile are stored using Android Keystore/iOS Keychain through Expo SecureStore. On later launches the app restores its saved Supabase session and cached profile without repeating the employee-role lookup; Supabase can silently refresh expired session tokens. No service-role key belongs in this app.

The initial native capability baseline includes camera/QR scanning for staff shift punches, Expo Notifications, OTA updates, local file handling and sharing for admin exports, and Reanimated for future screen transitions. Camera and notification permissions should be requested contextually from the feature that uses them, not during sign-in. Camera audio recording is disabled.

### Android push notifications (FCM through Expo)

The app registers an Expo push token and the backend sends notifications through Expo's push service; FCM is the Android delivery provider underneath. To enable remote delivery on Android:

1. Create or select a Firebase project and register an Android app with package name `com.qureocity.staff`.
2. Download `google-services.json` and place it in `apps/mobile/`. The dynamic Expo config detects the file and includes it in the native build. This file contains Firebase project identifiers; the separate service-account private key must never be committed.
3. Create a Google service-account key with the **Firebase Cloud Messaging API Admin** role and upload it to the QureoCity EAS project under **Credentials → Android → FCM V1 service account key**. Keep the downloaded private-key JSON outside the repository and delete local copies when no longer needed.
4. Build a new APK after both credentials are configured. Existing APKs do not gain native Firebase configuration from an OTA update.

Expo token registration, notification preferences, foreground display, event-driven delivery, and the in-app test-send action are already implemented. Firebase project credentials and a replacement APK are the remaining FCM setup items. The service-account key is used by Expo's push service; the mobile app does not contain it.

### Employee attendance setup

The mobile attendance screen scans the same static or rotating desk QR code as the website, but submits scans to the `mobile-employee-punch` Supabase Edge Function. That function validates the signed rotating code on the server and calls the existing authenticated `employee_toggle_punch` RPC; no QR signing secret is shipped in the app. Deploy the function before enabling mobile punch. If the venue uses dynamic QR mode, configure the same `QR_SIGNING_SECRET` value used by the website in Supabase Edge Function secrets. If a custom static code is configured, set `DESK_QR_VALUE` to that same value there as well.

Copy `.env.example` to `.env.local` and set the public Supabase URL and anon key. The root `.gitignore` excludes `.env*` files.


### Admin staff nudges

The admin dashboard's **Notify** action sends a push notification to the selected staff member's registered mobile devices. Deploy the `mobile-admin-notify` Supabase Edge Function before enabling this action:

```sh
supabase functions deploy mobile-admin-notify
```

The function verifies the signed-in admin and the selected staff role on the server. It uses the Supabase service-role key only inside the Edge Function; the mobile app never receives that key. Staff need a registered mobile push device to receive a nudge.

### Automated event notification setup

The **Send test notification** action calls `mobile-notification-test` directly, so it does not confirm that database-triggered event alerts are configured. Real check-in, checkout, staff, registration, and leave alerts follow a separate path: database trigger → `pg_net` → the deployed website's `/api/push/notify` route → Expo Push. Configure `PUSH_NOTIFY_SECRET` on the deployed website and set the database `push_config.notify_url` to the production `/api/push/notify` URL and `push_config.notify_secret` to the same secret. Migration 0118 updates `push_enqueue` so native-only device registrations can trigger that route.

Set the database row once, substituting the deployed website origin and the same secret configured in Vercel:

```sql
update public.push_config
set notify_url = 'https://<production-host>/api/push/notify',
    notify_secret = '<same value as PUSH_NOTIFY_SECRET>'
where id = true;
```

Each phone must be registered, the employee must turn on their event preferences in **Mobile notifications**, and an admin must enable the event rule. For staff recipients, the admin must also choose **On duty** or **All staff**; the default staff scope is **Admins**. The test button bypasses these event rules and preferences, which is why a test can arrive while real event alerts do not. Admins can inspect attempted real sends under **Push history**. If an event is absent there, check the production `push_config` URL/secret and recipient settings first.

## Run locally

```sh
npm install
npm run start
```

Use Expo Go for the first sign-in screen, or an Android emulator/device. A native development build is required once the app adds native capabilities that Expo Go does not include.

## APK distribution and updates

- `npm run build:apk` builds an Android APK using the EAS `preview` internal distribution profile.
- `npm run build:apk:production` builds the Android APK for the production update channel. Both profiles are directly installable; Play Store distribution is not required.
- `npm run publish:preview` publishes an Android JavaScript/assets update for compatible preview APKs.
- `npm run publish:production -- --message "..."` publishes to the production channel.
- EAS Update uses the matching Expo environment (`preview` or `production`) when bundling `EXPO_PUBLIC_` variables. SDK 55 and newer require an explicit environment for updates.
- OTA updates are checked at app launch. Runtime compatibility follows the app version: keep JavaScript/assets-only updates on the same version; when adding/upgrading native modules or changing native configuration, bump `expo.version` and Android `versionCode` and build a new APK so older APKs do not receive incompatible updates.
- Before the first EAS build or OTA publish, link this app to an Expo account/project so Expo can add the EAS project ID and update URL to app config. From this directory, run `npx eas-cli login`, `npx eas-cli init`, then `npx eas-cli update:configure`.
- After EAS is linked, pushes to `main` that change `apps/mobile/**` publish preview OTA updates through GitHub Actions. Add an `EXPO_TOKEN` repository secret to enable the workflow. Production publishing should be enabled after its environment variables and production APK are configured. Native changes still require a newly built APK.

### Set up the publishing token

`EXPO_TOKEN` is an Expo access token that lets GitHub Actions authenticate EAS CLI. It is separate from Supabase keys and from Expo/device push tokens; never add it to the app, `.env.local`, or source control.

1. Create a limited Expo access token at <https://expo.dev/settings/access-tokens> (for organization automation, use a restricted robot user if available).
2. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**.
3. Name the secret `EXPO_TOKEN` and paste the token as its value.
4. Once the Expo project is linked, changes to `apps/mobile/**` merged or pushed to `main` publish updates to the `preview` channel using `.github/workflows/mobile-ota-update.yml`.
