"use client";

import { useEffect, useRef, useState } from "react";

const STATIC_QR_VALUE = process.env.NEXT_PUBLIC_DESK_QR_VALUE ?? "QUREOCITY-FRONT-DESK";

// ---------------------------------------------------------------------
// PLUG-AND-PLAY POINT for the future rotating QR.
// When you're ready to build it, this is the one function to implement:
// it should return a fresh signed value (e.g. a short JWT or
// HMAC(secret, timestamp)) from a server endpoint, and this component
// already re-calls it on the interval below. Everything else — the
// toggle, the settings row, the desk page, the QR rendering — is
// already wired to use whatever this returns.
// ---------------------------------------------------------------------
async function getDynamicQrValue(): Promise<string> {
  // TODO: replace with a fetch to a signed-token endpoint, e.g.:
  // const res = await fetch("/api/desk/qr-token");
  // return (await res.json()).token;
  return STATIC_QR_VALUE; // falls back to static until this is implemented
}

export default function DeskQrDisplay({ mode }: { mode: "static" | "dynamic" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [notice, setNotice] = useState<string | null>(
    mode === "dynamic" ? "Dynamic mode not built yet — showing the static code." : null
  );

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    async function render() {
      const QRCode = (await import("qrcode")).default;
      const value = mode === "dynamic" ? await getDynamicQrValue() : STATIC_QR_VALUE;
      if (cancelled || !canvasRef.current) return;
      QRCode.toCanvas(canvasRef.current, value, { width: 360, margin: 2 });
    }

    render();
    if (mode === "dynamic") {
      // Re-renders every 45s once getDynamicQrValue() actually rotates —
      // harmless no-op refresh until then, since it returns the same
      // static value each time.
      interval = setInterval(render, 45_000);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [mode]);

  return (
    <div className="min-h-screen bg-brand-cloud flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-xl2 shadow-sm p-10 text-center">
        <p className="text-brand-ink/60 font-medium mb-6">Scan to punch in / out</p>
        <canvas ref={canvasRef} />
        {notice && <p className="text-xs text-brand-ink/40 mt-4">{notice}</p>}
      </div>
    </div>
  );
}
