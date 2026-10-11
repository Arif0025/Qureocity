"use client";

import { useEffect, useState } from "react";
import { setQrMode } from "@/app/admin/actions";
import { createClient } from "@/lib/supabase/client";

export default function QrModeToggle({
  initialMode,
}: {
  initialMode: "static" | "dynamic";
}) {
  const [mode, setMode] = useState(initialMode);
  const [saving, setSaving] = useState(false);

  // The settings tab can be opened through client-side history navigation,
  // so its server-provided initial value may come from the previous tab.
  // Refresh this small setting when the control mounts.
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void supabase
      .from("app_settings")
      .select("qr_mode")
      .eq("id", true)
      .single()
      .then(({ data }) => {
        if (active && (data?.qr_mode === "static" || data?.qr_mode === "dynamic")) {
          setMode(data.qr_mode);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleChange = async (next: "static" | "dynamic") => {
    if (next === mode) return;
    setSaving(true);
    const result = await setQrMode(next);
    setSaving(false);

    if (result.error) {
      alert(result.error);
      return;
    }
    setMode(next);
  };

  return (
    <div className="bg-brand-nightSurface rounded-xl2 shadow-sm p-5">
      <p className="font-semibold text-brand-nightText mb-1">Front-desk QR</p>
      <p className="text-sm text-brand-nightText/50 mb-4">
        Static is a fixed code — simplest, no screen needed. Dynamic shows a
        signed code on{" "}
        <code className="text-xs bg-white/8 px-1 py-0.5 rounded">/desk</code>{" "}
        that rotates every 45s, so a photo of it stops working almost
        immediately.
      </p>
      <div className="flex gap-2">
        {(["static", "dynamic"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => handleChange(opt)}
            disabled={saving}
            className={`flex-1 min-h-[48px] rounded-xl2 border-2 font-semibold capitalize disabled:opacity-50 ${
              mode === opt
                ? "border-brand-sky bg-brand-sky/10 text-brand-nightText"
                : "border-white/15 text-brand-nightText/50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
