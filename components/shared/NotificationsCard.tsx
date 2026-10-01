"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Toggle from "@/components/shared/Toggle";
import { PUSH_EVENT_META, type PushEventType } from "@/lib/push/events";
import {
  disableThisDevice,
  enableThisDevice,
  getCurrentSubscription,
  getPermission,
  getPushSupport,
  sendTestNotification,
  type PushSupport,
} from "@/lib/push/client";

type Settings = {
  role: string;
  device_count: number;
  this_device_registered: boolean;
  last_sent_at: string | null;
  last_failed_at: string | null;
  events: { event_type: PushEventType; enabled: boolean }[];
};

function isAndroid(): boolean {
  return (
    typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)
  );
}

function androidBrand(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/; ?(Mi |Redmi|POCO)/i.test(ua)) return "Xiaomi/Redmi/POCO (MIUI)";
  if (/; ?vivo/i.test(ua)) return "Vivo";
  if (/; ?(realme)/i.test(ua)) return "Realme";
  if (/; ?(CPH|OPPO)/i.test(ua)) return "Oppo";
  if (/; ?(SM-|Galaxy)/i.test(ua)) return "Samsung";
  return null;
}

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Personal notification settings — works for admins and employees alike.
// Off by default: nothing is sent to a device until its owner turns it on
// here, and each person picks which of the events open to their role
// they want.
export default function NotificationsCard() {
  const supabase = createClient();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = getPushSupport();
    setSupport(s);
    setPermission(getPermission());

    let ep: string | null = null;
    if (s === "ready") {
      const sub = await getCurrentSubscription();
      ep = sub?.endpoint ?? null;
    }
    setEndpoint(ep);

    const { data, error: rpcError } = await supabase.rpc("push_my_settings", {
      p_endpoint: ep,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSettings(data as Settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deviceOn = !!endpoint && !!settings?.this_device_registered;
  const available = settings?.events ?? [];

  const setPreference = async (event: PushEventType, enabled: boolean) => {
    setError(null);
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            events: prev.events.map((e) =>
              e.event_type === event ? { ...e, enabled } : e,
            ),
          }
        : prev,
    );
    const { error: rpcError } = await supabase.rpc("push_set_preference", {
      p_event: event,
      p_enabled: enabled,
    });
    if (rpcError) {
      setError(rpcError.message);
      load();
    }
  };

  const toggleDevice = async (on: boolean) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    if (on) {
      const result = await enableThisDevice();
      setPermission(getPermission());
      if (!result.ok) {
        setError(result.message);
        setBusy(false);
        return;
      }
      // First time on: start with everything open to this person switched
      // on (they can untick what they don't want right below).
      if (available.length > 0 && !available.some((e) => e.enabled)) {
        await Promise.all(
          available.map((e) =>
            supabase.rpc("push_set_preference", {
              p_event: e.event_type,
              p_enabled: true,
            }),
          ),
        );
      }
      const tested = await sendTestNotification(result.endpoint);
      setMessage(
        tested
          ? "Notifications are on. A test message was sent to this device."
          : "Notifications are on for this device, but the test message didn't go through.",
      );
    } else {
      await disableThisDevice();
      setMessage("Notifications are off for this device.");
    }

    await load();
    setBusy(false);
  };

  const noEventsForMe = settings !== null && available.length === 0;

  return (
    <div className="bg-brand-nightSurface rounded-xl2 shadow-sm p-5">
      <p className="font-semibold text-brand-nightText mb-1">
        Notifications on this device
      </p>
      <p className="text-sm text-brand-nightText/50 mb-4">
        Get an alert on this phone or computer even when QureoCity isn&apos;t
        open. It&apos;s off until you turn it on, and it only applies to this
        device.
      </p>

      {support === null || settings === null ? (
        <p className="text-sm text-brand-nightText/50">Loading…</p>
      ) : support === "needs-install" ? (
        <p className="text-sm text-brand-nightText/70 bg-brand-sun/10 border border-brand-sun/30 rounded-xl2 p-3">
          On iPhone, notifications work once QureoCity is added to your Home
          Screen. Tap the Share button in Safari, choose{" "}
          <span className="font-semibold">Add to Home Screen</span>, then open
          QureoCity from your Home Screen and turn this on there.
        </p>
      ) : support === "unsupported" ? (
        <p className="text-sm text-brand-nightText/70">
          This browser can&apos;t receive notifications. Try Chrome on Android,
          or add QureoCity to your Home Screen on iPhone.
        </p>
      ) : permission === "denied" && !deviceOn ? (
        <p className="text-sm text-brand-nightText/70 bg-brand-coral/10 border border-brand-coral/30 rounded-xl2 p-3">
          Notifications are blocked for this site. Allow them in your
          browser&apos;s site settings, then reload this page.
        </p>
      ) : noEventsForMe ? (
        <p className="text-sm text-brand-nightText/70">
          Your admin hasn&apos;t turned on any notifications for employees yet.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-nightText">
                {deviceOn ? "On for this device" : "Off for this device"}
              </p>
              {deviceOn &&
                (settings.last_sent_at || settings.last_failed_at) && (
                  <p className="text-xs text-brand-nightText/40 mt-0.5">
                    {settings.last_sent_at
                      ? `Last notification sent ${timeAgo(settings.last_sent_at)}`
                      : "No notification has reached this device yet"}
                    {settings.last_failed_at &&
                      (!settings.last_sent_at ||
                        new Date(settings.last_failed_at) >
                          new Date(settings.last_sent_at)) &&
                      " · a recent attempt failed"}
                  </p>
                )}
            </div>
            <Toggle
              checked={deviceOn}
              disabled={busy}
              onChange={toggleDevice}
              label="Notifications on this device"
            />
          </div>

          {deviceOn && isAndroid() && (
            <details className="mt-3 text-xs text-brand-nightText/50">
              <summary className="cursor-pointer select-none hover:text-brand-nightText transition-colors">
                Notifications arriving inconsistently on this phone?
              </summary>
              <div className="mt-2 pl-1 space-y-1">
                <p>
                  {androidBrand()
                    ? `${androidBrand()} phones often restrict background apps by default, which can silently block notifications even when this toggle is on.`
                    : "Some Android phones restrict background apps by default, which can silently block notifications even when this toggle is on."}
                </p>
                <p>
                  In your phone&apos;s Settings, find Chrome (or your browser)
                  under Apps, then Battery, and choose &quot;No
                  restrictions&quot; or &quot;Unrestricted&quot;. On Xiaomi,
                  Vivo, Oppo or Realme phones, also check for an
                  &quot;Autostart&quot; setting and turn it on for Chrome.
                </p>
              </div>
            </details>
          )}

          {deviceOn && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="text-xs font-semibold text-brand-nightText/50 uppercase tracking-wide mb-1">
                Notify me when
              </p>
              {available.map((e) => (
                <div
                  key={e.event_type}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-brand-nightText">
                      {PUSH_EVENT_META[e.event_type]?.label ?? e.event_type}
                    </p>
                  </div>
                  <Toggle
                    checked={e.enabled}
                    onChange={(v) => setPreference(e.event_type, v)}
                    label={PUSH_EVENT_META[e.event_type]?.label ?? e.event_type}
                  />
                </div>
              ))}
              <button
                type="button"
                disabled={busy || !endpoint}
                onClick={async () => {
                  if (!endpoint) return;
                  setBusy(true);
                  const ok = await sendTestNotification(endpoint);
                  setMessage(
                    ok
                      ? "Test message sent."
                      : "The test message didn't go through.",
                  );
                  await load();
                  setBusy(false);
                }}
                className="mt-2 text-sm font-semibold text-brand-nightText/70 hover:text-brand-sky transition-colors disabled:opacity-50"
              >
                Send a test notification
              </button>
              {settings.device_count > 1 && (
                <p className="text-xs text-brand-nightText/40 mt-2">
                  You have notifications on {settings.device_count} devices.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {message && <p className="text-sm text-brand-leaf mt-3">{message}</p>}
      {error && <p className="text-sm text-brand-coral mt-3">{error}</p>}
    </div>
  );
}
