"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const STATIC_QR_VALUE =
  process.env.NEXT_PUBLIC_DESK_QR_VALUE ?? "QUREOCITY-FRONT-DESK";
const BUCKET_MS = 45_000; // must match lib/qrToken.ts

// ---------------------------------------------------------------------
// Fetches a fresh signed, time-boxed token every 45s from the server.
// The signing secret never reaches the browser — this just displays
// whatever the server hands back.
// ---------------------------------------------------------------------
async function getDynamicQrValue(): Promise<string> {
  try {
    const res = await fetch("/api/desk/qr-token", { cache: "no-store" });
    const data = await res.json();
    return data.token ?? STATIC_QR_VALUE;
  } catch {
    return STATIC_QR_VALUE; // fail safe to static rather than showing a broken code
  }
}

// Ring is synced to the actual wall-clock bucket boundary (not a local
// timer that starts counting from whenever the page loaded) — so it
// stays accurate to the moment the code will really refresh, even if
// this tab has been open for hours.
function useBucketCountdown(active: boolean) {
  const [remainingMs, setRemainingMs] = useState(BUCKET_MS);

  useEffect(() => {
    if (!active) return;
    const tick = () => setRemainingMs(BUCKET_MS - (Date.now() % BUCKET_MS));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [active]);

  return remainingMs;
}

function CountdownRing({ remainingMs }: { remainingMs: number }) {
  const pct = remainingMs / BUCKET_MS;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="relative w-14 h-14 mx-auto">
      <svg viewBox="0 0 52 52" className="w-14 h-14 -rotate-90">
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke="#00000012"
          strokeWidth="4"
        />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke="#9A66AF"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.2s linear" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-brand-sky">
        {seconds}
      </span>
    </div>
  );
}

export default function DeskQrDisplay({
  mode,
}: {
  mode: "static" | "dynamic";
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const remainingMs = useBucketCountdown(mode === "dynamic");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const QRCode = (await import("qrcode")).default;
      const value =
        mode === "dynamic" ? await getDynamicQrValue() : STATIC_QR_VALUE;
      if (cancelled || !canvasRef.current) return;
      QRCode.toCanvas(canvasRef.current, value, {
        width: 320,
        margin: 2,
        color: { dark: "#3A2E42", light: "#FFFFFF" },
      });
    }

    render();
    // Re-fetch right as each bucket rolls over, synced to the same
    // clock the countdown ring uses, rather than a fixed setInterval
    // that could drift out of step with it.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (mode === "dynamic") {
      const msUntilNextBucket = BUCKET_MS - (Date.now() % BUCKET_MS);
      timeout = setTimeout(function loop() {
        render();
        timeout = setTimeout(loop, BUCKET_MS);
      }, msUntilNextBucket);
    }

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [mode]);

  return (
    <div className="min-h-screen bg-brand-cloud flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full bg-brand-sun/20 blur-2xl" />
      <div className="pointer-events-none absolute bottom-0 -right-20 w-80 h-80 rounded-full bg-brand-sky/10 blur-2xl" />

      <button
        type="button"
        onClick={() => router.push("/")}
        aria-label="Go to home"
        className="mb-6 relative hover:opacity-90 transition-opacity"
      >
        <img src="/logo-full.png" alt="QureoCity" className="h-14" />
      </button>

      <div className="bg-white rounded-xl2 shadow-lg p-10 text-center relative">
        <p className="text-brand-ink/60 font-semibold mb-6">
          Scan to punch in / out
        </p>
        <canvas ref={canvasRef} className="mx-auto rounded-lg" />

        {mode === "dynamic" && (
          <div className="mt-6">
            <CountdownRing remainingMs={remainingMs} />
            <p className="text-xs text-brand-ink/40 mt-2">
              Refreshes automatically
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
