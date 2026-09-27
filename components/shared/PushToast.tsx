"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Toast = { id: number; title: string; body: string; url: string };

// When a push arrives while the app is open and on screen, the service
// worker skips the system notification and hands the message here
// instead, so nobody gets both a banner and a toast.
export default function PushToast() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "push-foreground") return;
      const p = event.data.payload as {
        title?: string;
        body?: string;
        url?: string;
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
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 right-3 left-3 sm:left-auto sm:w-80 z-50 space-y-2"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            setToasts((prev) => prev.filter((x) => x.id !== t.id));
            if (t.url) router.push(t.url);
          }}
          className="block w-full text-left bg-brand-nightSurface border border-brand-sky/40 rounded-xl2 shadow-lg p-3"
        >
          <p className="text-sm font-semibold text-brand-nightText">
            {t.title}
          </p>
          {t.body && (
            <p className="text-xs text-brand-nightText/60 mt-0.5">{t.body}</p>
          )}
        </button>
      ))}
    </div>
  );
}
