"use client";

import { createClient } from "@/lib/supabase/client";

// Browser-side helpers for turning push notifications on/off for THIS
// device. Everything that needs a user gesture (the permission prompt)
// is called from a button click in NotificationsCard.

export type PushSupport = "unsupported" | "needs-install" | "ready";

export function getPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";

  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  // iPhones only offer push to apps installed to the Home Screen; in a
  // normal Safari tab the API simply isn't there.
  if (isIOS && !standalone) return "needs-install";

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  return "ready";
}

export function getPermission(): NotificationPermission {
  return typeof Notification === "undefined"
    ? "default"
    : Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iPhone"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox/.test(ua)
        ? "Firefox"
        : /Chrome/.test(ua)
          ? "Chrome"
          : /Safari/.test(ua)
            ? "Safari"
            : "Browser";
  return `${os} · ${browser}`;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (getPushSupport() !== "ready") return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

// Asks for permission, subscribes this browser to the push service and
// saves the subscription against the signed-in account.
export async function enableThisDevice(): Promise<
  | { ok: true; endpoint: string }
  | { ok: false; reason: "denied" | "error"; message: string }
> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return {
      ok: false,
      reason: "error",
      message: "Notifications aren't set up on the server yet.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason: "denied",
      message: "Notifications were not allowed on this device.",
    };
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      } catch {
        // A leftover subscription made with different keys blocks a new
        // one; clear it and try once more.
        const stale = await reg.pushManager.getSubscription();
        if (stale) await stale.unsubscribe();
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
    }

    const json = sub.toJSON();
    const supabase = createClient();
    const { error } = await supabase.rpc("push_save_subscription", {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh ?? "",
      p_auth_secret: json.keys?.auth ?? "",
      p_user_agent: navigator.userAgent,
      p_device_label: deviceLabel(),
    });
    if (error) {
      await sub.unsubscribe();
      return { ok: false, reason: "error", message: error.message };
    }
    return { ok: true, endpoint: sub.endpoint };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message:
        err instanceof Error ? err.message : "Could not turn notifications on.",
    };
  }
}

export async function disableThisDevice(): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  const supabase = createClient();
  await supabase.rpc("push_remove_subscription", { p_endpoint: endpoint });
  await sub.unsubscribe();
}

export async function sendTestNotification(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
