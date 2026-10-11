"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshSubscriptionIfNeeded } from "@/lib/push/client";

type Toast = { id: number; title: string; body: string; url: string; actions: { action: string; title: string; url: string }[] };

// When a push arrives while the app is open and on screen, the service
// worker skips the system notification and hands the message here
// instead, so nobody gets both a banner and a toast.
export default function PushToast({ onNavigate }: { onNavigate?: (url: string) => void }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Runs once per app load, for whoever has notifications already
  // granted — quietly repairs a subscription the browser silently
  // dropped, instead of waiting for the next failed send to notice.
  useEffect(() => {
    refreshSubscriptionIfNeeded();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "navigate-to" && typeof event.data.url === "string") {
        const target = new URL(event.data.url, window.location.origin);
        const href = target.pathname + target.search + target.hash;
        if (onNavigate) onNavigate(href);
        else router.push(href);
        return;
      }
      if (event.data?.type !== "push-foreground") return;
      const p = event.data.payload as {
        title?: string;
        body?: string;
        url?: string;
        actions?: { action: string; title: string }[];
        actionUrls?: Record<string, string>;
      };
      const id = Date.now() + Math.random();
      setToasts((prev) =>
        [
          ...prev,
          {
            id,
            title: p.title ?? "QureoCity",
            body: p.body ?? "",
            url: p.url ?? "",
            actions: (p.actions ?? []).slice(0, 2).flatMap((action) => {
              const url = p.actionUrls?.[action.action];
              return url ? [{ ...action, url }] : [];
            }),
          },
        ].slice(-3),
      );
      window.setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        8000,
      );
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [onNavigate, router]);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 right-3 left-3 sm:left-auto sm:w-80 z-50 space-y-2"
    >
      {toasts.map((t) => (
        <div key={t.id} className="bg-brand-nightSurface border border-brand-sky/40 rounded-xl2 shadow-lg p-3">
          <button type="button" onClick={() => {
            setToasts((prev) => prev.filter((x) => x.id !== t.id));
            if (t.url) { if (onNavigate) onNavigate(t.url); else router.push(t.url); }
          }} className="block w-full text-left">
          <p className="text-sm font-semibold text-brand-nightText">
            {t.title}
          </p>
          {t.body && (
            <p className="text-xs text-brand-nightText/60 mt-0.5">{t.body}</p>
          )}
          </button>
          {t.actions.length > 0 && <div className="mt-2 flex gap-2">{t.actions.map((action) => <button key={action.action} type="button" onClick={() => {
            setToasts((prev) => prev.filter((x) => x.id !== t.id));
            if (onNavigate) onNavigate(action.url); else router.push(action.url);
          }} className="min-h-8 rounded-lg bg-brand-sky px-3 text-xs font-semibold text-brand-ink">{action.title}</button>)}</div>}
        </div>
      ))}
    </div>
  );
}
