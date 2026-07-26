"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// The front-desk QR is STATIC for now (per the current build phase).
// Known limitation, called out deliberately: a static code can be
// photographed and reused remotely, so it proves "this code was scanned"
// rather than "this person is on-site right now."
//
// PLUG-AND-PLAY POINT: when dynamic mode is built (see
// components/desk/DeskQrDisplay.tsx → getDynamicQrValue), swap the
// simple string-equality check below for a signature + timestamp-window
// verification, and check the token against a small "already used"
// table (same self-pruning pattern as checkin_rate_limit) to block
// replay within the token's own window. The admin toggle for
// static/dynamic already exists (app_settings.qr_mode) — this is the
// only place left to change once that's ready.
const QR_EXPECTED_VALUE = process.env.NEXT_PUBLIC_DESK_QR_VALUE ?? "QUREOCITY-FRONT-DESK";

export default function PunchInFlow() {
  const supabase = createClient();
  const [scanned, setScanned] = useState(false);
  const [sliding, setSliding] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    if (scanned || done) return;
    let html5QrCode: any;

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;
      html5QrCode
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          (decodedText: string) => {
            if (decodedText === QR_EXPECTED_VALUE) {
              setScanned(true);
              html5QrCode.stop().catch(() => {});
            }
          },
          () => {} // ignore per-frame scan misses
        )
        .catch((e: any) => setError("Camera unavailable: " + e));
    });

    return () => {
      scannerRef.current?.stop?.().catch(() => {});
    };
  }, [scanned, done]);

  const handleSlideComplete = async () => {
    setSliding(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const { error } = await supabase.from("attendance_logs").insert({ employee_id: user.id });
      if (error) throw error;
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? "Couldn't record punch-in.");
      setSliding(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-brand-cloud flex items-center justify-center px-4">
        <div className="bg-white rounded-xl2 shadow-sm p-8 text-center max-w-sm w-full">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-leaf/15 flex items-center justify-center text-brand-leaf text-3xl">✓</div>
          <h1 className="text-xl font-bold text-brand-ink">Punched in</h1>
          <p className="text-brand-ink/50 text-sm mt-1">{new Date().toLocaleTimeString()}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cloud flex flex-col items-center justify-center px-4">
      {error && <p className="text-brand-coral mb-3 text-sm">{error}</p>}

      {!scanned && (
        <div className="w-full max-w-sm bg-white rounded-xl2 shadow-sm p-4">
          <p className="text-center text-brand-ink/60 mb-3 text-sm">Scan the desk QR code</p>
          <div id="qr-reader" className="rounded-xl2 overflow-hidden" />
        </div>
      )}

      {scanned && (
        <div className="w-full max-w-sm bg-white rounded-xl2 shadow-sm p-8 text-center">
          <p className="font-semibold text-brand-ink mb-6">Slide to punch in</p>
          <button
            onPointerDown={() => {}}
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
