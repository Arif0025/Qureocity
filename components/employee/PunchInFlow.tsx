"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";

const STATIC_QR_VALUE =
  process.env.NEXT_PUBLIC_DESK_QR_VALUE ?? "QUREOCITY-FRONT-DESK";

export default function PunchInFlow() {
  const [supabase] = useState(() => createClient());
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
    let hasStopped = false;

    // Both the "scan succeeded" path and the effect cleanup path need to
    // stop the camera, but calling .stop() a second time on an already-
    // stopped scanner throws — in some versions of this library, that
    // throw happens synchronously rather than as a promise rejection, so
    // a plain .catch() doesn't actually catch it and it crashes the page.
    // This flag guarantees stop() only ever runs once per instance.
    const stopScanner = () => {
      if (hasStopped) return;
      hasStopped = true;
      try {
        html5QrCode?.stop()?.catch(() => {});
      } catch {
        // some versions throw synchronously instead of rejecting
      }
    };

    import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        html5QrCode = new Html5Qrcode("qr-reader");
        scannerRef.current = { stop: stopScanner };
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
              stopScanner();
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
      stopScanner();
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
      // The scanner has already stopped after a successful QR read. Return
      // to the camera-launch state so an expired/used dynamic token can be
      // scanned again without reloading the employee panel.
      setScannedValue(null);
      setScannerActive(false);
    } finally {
      setSliding(false);
    }
  };

  if (result) {
    return (
      <div className="bg-brand-nightSurface rounded-xl2 shadow-sm p-8 text-center max-w-sm w-full mx-auto">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-leaf/15 flex items-center justify-center text-brand-leaf text-3xl">
          ✓
        </div>
        <h1 className="text-xl font-bold text-brand-nightText">
          Punched {result.action === "in" ? "in" : "out"}
        </h1>
        <p className="text-brand-nightText/50 text-sm mt-1">
          {formatTimeIST(result.at)}
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
        <div className="w-full max-w-sm bg-brand-nightSurface rounded-xl2 shadow-sm p-8 text-center">
          <p className="text-brand-nightText/70 text-sm mb-6">
            Tap to open the camera and scan the desk QR code
          </p>
          <button
            type="button"
            onClick={() => setScannerActive(true)}
            disabled={scannerLoading}
            className="relative mx-auto flex items-center justify-center w-24 h-24 rounded-full bg-brand-sky text-white text-3xl disabled:opacity-50 hover:scale-105 active:scale-95 transition-transform"
          >
            <span className="absolute inset-0 rounded-full bg-brand-sky animate-ping opacity-20" />
            <span className="relative">{scannerLoading ? "…" : "📷"}</span>
          </button>
          <p className="text-xs text-brand-nightText/40 mt-4 font-semibold">
            {scannerLoading ? "Starting camera…" : "Tap to scan"}
          </p>
        </div>
      )}

      {!scannedValue && scannerActive && (
        <div className="w-full max-w-sm bg-brand-nightSurface rounded-xl2 shadow-sm p-4">
          <p className="text-center text-brand-nightText/60 mb-3 text-sm">
            Scan the desk QR code
          </p>
          {scannerLoading && (
            <p className="text-center text-brand-nightText/50 text-sm mb-3">
              Starting camera…
            </p>
          )}
          <div id="qr-reader" className="rounded-xl2 overflow-hidden" />
        </div>
      )}

      {scannedValue && (
        <div className="w-full max-w-sm bg-brand-nightSurface rounded-xl2 shadow-sm p-8 text-center">
          <p className="font-semibold text-brand-nightText mb-6">
            Slide to confirm
          </p>
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
