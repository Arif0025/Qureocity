"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Clock3 } from "lucide-react";

type Settings = { party_booking_open_time: string; party_booking_close_time: string; party_booking_gap_minutes: number };

export default function PartyBookingSettingsCard() {
  const [settings, setSettings] = useState<Settings>({ party_booking_open_time: "10:00", party_booking_close_time: "20:00", party_booking_gap_minutes: 60 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.from("app_settings")
      .select("party_booking_open_time, party_booking_close_time, party_booking_gap_minutes")
      .eq("id", true).single()
      .then(({ data, error }) => {
        if (data) setSettings({
          party_booking_open_time: String(data.party_booking_open_time).slice(0, 5),
          party_booking_close_time: String(data.party_booking_close_time).slice(0, 5),
          party_booking_gap_minutes: Number(data.party_booking_gap_minutes),
        });
        if (error) setNotice(error.message);
        setLoading(false);
      });
  }, []);

  const save = async () => {
    if (settings.party_booking_open_time >= settings.party_booking_close_time) {
      setNotice("Closing time must be after opening time.");
      return;
    }
    setSaving(true); setNotice(null);
    const supabase = createClient();
    const { error } = await supabase.from("app_settings").update(settings).eq("id", true);
    setSaving(false);
    setNotice(error ? error.message : "Party booking hours saved.");
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-brand-nightSurface p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-sky/10 text-brand-skyLight"><Clock3 size={17} /></span>
        <div><h2 className="font-bold text-brand-nightText">Party booking availability</h2><p className="mt-0.5 text-sm text-brand-nightText/45">Set venue hours and the cleanup/reset gap between parties (IST).</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-brand-nightText/55">Opens<input type="time" disabled={loading} value={settings.party_booking_open_time} onChange={(e) => setSettings((v) => ({ ...v, party_booking_open_time: e.target.value }))} className="min-h-10 w-full rounded-lg border border-white/15 bg-brand-nightSurface2 px-3 text-sm text-brand-nightText" /></label>
        <label className="space-y-1 text-xs text-brand-nightText/55">Closes<input type="time" disabled={loading} value={settings.party_booking_close_time} onChange={(e) => setSettings((v) => ({ ...v, party_booking_close_time: e.target.value }))} className="min-h-10 w-full rounded-lg border border-white/15 bg-brand-nightSurface2 px-3 text-sm text-brand-nightText" /></label>
        <label className="space-y-1 text-xs text-brand-nightText/55">Gap between parties<select disabled={loading} value={settings.party_booking_gap_minutes} onChange={(e) => setSettings((v) => ({ ...v, party_booking_gap_minutes: Number(e.target.value) }))} className="min-h-10 w-full rounded-lg border border-white/15 bg-brand-nightSurface2 px-3 text-sm text-brand-nightText"><option value={60}>1 hour</option><option value={90}>1 hour 30 minutes</option><option value={120}>2 hours</option></select><span className="block text-[10px] text-brand-nightText/35">Minimum space after a party ends before the next begins.</span></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-brand-nightText/50">{notice}</p>
        <button type="button" disabled={loading || saving} onClick={() => void save()} className="min-h-9 rounded-lg bg-brand-sky px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save availability"}</button>
      </div>
    </section>
  );
}
