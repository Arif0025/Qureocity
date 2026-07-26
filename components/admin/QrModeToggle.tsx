"use client";

import { useState } from "react";
import { setQrMode } from "@/app/admin/actions";

export default function QrModeToggle({ initialMode }: { initialMode: "static" | "dynamic" }) {
  const [mode, setMode] = useState(initialMode);
  const [saving, setSaving] = useState(false);

  const handleChange = async (next: "static" | "dynamic") => {
    if (next === mode) return;
    setSaving(true);
    try {
      await setQrMode(next);
      setMode(next);
    } catch (e: any) {
      alert(e.message ?? "Couldn't change QR mode.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl2 shadow-sm p-5">
      <p className="font-semibold text-brand-ink mb-1">Front-desk QR</p>
      <p className="text-sm text-brand-ink/50 mb-4">
        Static is a fixed code — simplest, works today. Dynamic rotates a
        signed code every 30–60s once you have a dedicated screen wired up.
      </p>
      <div className="flex gap-2">
        {(["static", "dynamic"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => handleChange(opt)}
            disabled={saving}
            className={`flex-1 min-h-[48px] rounded-xl2 border-2 font-semibold capitalize disabled:opacity-50 ${
              mode === opt
                ? "border-brand-sky bg-brand-sky/10 text-brand-ink"
                : "border-brand-ink/10 text-brand-ink/50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {mode === "dynamic" && (
        <p className="text-xs text-brand-coral mt-3">
          Dynamic mode isn't implemented yet — the desk display will fall
          back to the static code until that's built. Safe to leave toggled
          on now if you want it to switch over automatically later.
        </p>
      )}
    </div>
  );
}
