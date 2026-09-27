import webpush from "web-push";
import type { PushMessage } from "./events";

// Only ever POST to the real browser push services. A device could
// register any URL as its "endpoint"; without this check the server
// would fire requests at whatever address it was given.
const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome / Android / Edge / Samsung
  "push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari / iOS home-screen apps
  "notify.windows.com", // legacy Edge / Windows
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return ALLOWED_PUSH_HOSTS.some(
      (h) => url.hostname === h || url.hostname.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

let configured = false;

export function pushIsConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export type PushTarget = {
  endpoint: string;
  p256dh: string;
  auth_secret: string;
};

// "gone" means the browser says this subscription no longer exists
// (uninstalled, permission revoked) — the caller should delete it.
export type SendResult = "sent" | "gone" | "failed";

export async function sendPush(
  target: PushTarget,
  message: PushMessage,
  ttlSeconds = 3600,
): Promise<SendResult> {
  if (!isAllowedPushEndpoint(target.endpoint)) return "gone";
  configure();
  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth_secret },
      },
      JSON.stringify(message),
      // A stale "child checked in" alert is useless an hour later, so
      // undelivered messages expire instead of piling up on a phone
      // that was switched off.
      { TTL: ttlSeconds, urgency: "high" },
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("[push] send failed", status, (err as Error).message);
    return "failed";
  }
}
