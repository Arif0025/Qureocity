"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const STATIC_QR_VALUE =
  process.env.NEXT_PUBLIC_DESK_QR_VALUE ?? "QUREOCITY-FRONT-DESK";

export default function PunchInFlow() {
  const supabase = createClient();
  const [qrMode, setQrMode] = useState<"static" | "dynamic">("static");
  const [scannedValue, setScannedValue] = useState<string | null>(null);
  const [sliding, setSliding] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [result, setResult] = useState<{
    action: "in" | "out";
    at: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("qr_mode")
      .eq("id", true)
      .single()
      .then(({ data }) =>
        setQrMode((data?.qr_mode as "static" | "dynamic") ?? "static"),
      );
  }, [supabase]);

  useEffect(() => {
    if (!scannerActive || scannedValue || result) return;

    setScannerLoading(true);
    setError(null);
    let html5QrCode: any;

    import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        html5QrCode = new Html5Qrcode("qr-reader");
        scannerRef.current = html5QrCode;
        return html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          (decodedText: string) => {
            const looksValid =
              qrMode === "static"
                ? decodedText === STATIC_QR_VALUE
                : /^\d+\.[a-f0-9]{24}$/.test(decodedText);

            if (looksValid) {
              setScannedValue(decodedText);
              html5QrCode.stop().catch(() => {});
            }
          },
          () => {},
        );
      })
      .then(() => {
        setScannerLoading(false);
      })
      .catch((e: any) => {
        setScannerLoading(false);
        setScannerActive(false);
        setError("Camera unavailable: " + e);
      });

    return () => {
      scannerRef.current?.stop?.().catch(() => {});
      scannerRef.current = null;
    };
  }, [scannerActive, scannedValue, result, qrMode]);

  const handleSlideComplete = async () => {
    setSliding(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: qrMode, value: scannedValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't record punch.");
      setResult({ action: data.action, at: data.at });
    } catch (e: any) {
      setError(e.message ?? "Couldn't record punch.");
    } finally {
      setSliding(false);
    }
  };

  if (result) {
    return (
      <div className="bg-white rounded-xl2 shadow-sm p-8 text-center max-w-sm w-full mx-auto">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-leaf/15 flex items-center justify-center text-brand-leaf text-3xl">
          ✓
        </div>
        <h1 className="text-xl font-bold text-brand-ink">
          Punched {result.action === "in" ? "in" : "out"}
        </h1>
        <p className="text-brand-ink/50 text-sm mt-1">
          {new Date(result.at).toLocaleTimeString()}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center px-4 py-8">
      {error && (
        <p className="text-brand-coral mb-3 text-sm text-center">{error}</p>
      )}

      {!scannedValue && !scannerActive && (
        <div className="w-full max-w-sm bg-white rounded-xl2 shadow-sm p-6 text-center">
          <p className="text-brand-ink/70 text-sm mb-4">
            Tap below to open the camera and scan the desk QR code.
          </p>
          <button
            type="button"
            onClick={() => setScannerActive(true)}
            disabled={scannerLoading}
            className="min-h-[48px] rounded-xl2 bg-brand-sky px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {scannerLoading ? "Starting camera…" : "Start camera"}
          </button>
        </div>
      )}

      {!scannedValue && scannerActive && (
        <div className="w-full max-w-sm bg-white rounded-xl2 shadow-sm p-4">
          <p className="text-center text-brand-ink/60 mb-3 text-sm">
            Scan the desk QR code
          </p>
          {scannerLoading && (
            <p className="text-center text-brand-ink/50 text-sm mb-3">
              Starting camera…
            </p>
          )}
          <div id="qr-reader" className="rounded-xl2 overflow-hidden" />
        </div>
      )}

      {scannedValue && (
        <div className="w-full max-w-sm bg-white rounded-xl2 shadow-sm p-8 text-center">
          <p className="font-semibold text-brand-ink mb-6">Slide to confirm</p>
          <button
            onClick={handleSlideComplete}
            disabled={sliding}
            className="w-full min-h-[64px] rounded-xl2 bg-brand-leaf text-white font-bold text-lg disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
          >
            {sliding ? "Recording…" : "→ Slide / tap to confirm"}
          </button>
        </div>
      )}
    </div>
  );
}
