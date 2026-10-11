"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, ChevronDown, LoaderCircle, MapPin, Phone, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { expandCollapse } from "@/lib/motion";

type ConfirmedParty = {
  id: string;
  plan_name: string;
  plan_price: number | null;
  area_type: "party_room" | "entire_play_area";
  kids_count: number;
  adults_count: number;
  duration_minutes: number;
  parent_name: string;
  phone: string;
  child_name: string;
  custom_request: boolean;
  request_message: string | null;
  admin_quote: number | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
};

const dateTime = (value: string) => new Date(value).toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
});

export default function UpcomingConfirmedParties() {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [rows, setRows] = useState<ConfirmedParty[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.from("party_bookings").select("id", { count: "exact", head: true })
      .eq("status", "confirmed").gte("starts_at", new Date().toISOString())
      .then(({ count: total, error: countError }) => {
        if (!active) return;
        if (countError) setError("Could not load the upcoming-party count.");
        else setCount(total ?? 0);
      });
    return () => { active = false; };
  }, [supabase]);

  const load = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase.from("party_bookings")
      .select("id, plan_name, plan_price, area_type, kids_count, adults_count, duration_minutes, parent_name, phone, child_name, custom_request, request_message, admin_quote, starts_at, ends_at, created_at")
      .eq("status", "confirmed").gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true }).limit(100);
    if (queryError) setError("Could not load confirmed parties.");
    else {
      setRows((data as ConfirmedParty[]) ?? []);
      setLoaded(true);
    }
    setLoading(false);
  }, [loaded, loading, supabase]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  return <section className="overflow-hidden rounded-xl border border-brand-leaf/20 bg-brand-nightSurface2">
    <button type="button" aria-expanded={open} onClick={toggle} className="flex min-h-14 w-full items-center gap-3 px-3 text-left sm:px-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-leaf/10 text-brand-leaf"><CalendarClock size={16} /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-brand-nightText">Upcoming confirmed parties</span><span className="block text-xs text-brand-nightText/45">Accepted bookings scheduled for a future date</span></span>
      {count !== null && <span aria-label={`${count} upcoming confirmed parties`} className="rounded-full bg-brand-leaf/10 px-2.5 py-1 text-xs font-bold tabular-nums text-brand-leaf">{count}</span>}
      <ChevronDown size={16} className={`shrink-0 text-brand-nightText/40 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    <AnimatePresence initial={false}>{open && <motion.div {...expandCollapse} className="overflow-hidden">
      <div className="space-y-2 border-t border-white/[0.06] p-3">
        {error && <p role="alert" className="rounded-lg border border-brand-coral/20 bg-brand-coral/5 px-3 py-2 text-xs text-brand-coral">{error}</p>}
        {loading && !loaded ? <p className="flex items-center justify-center gap-2 py-6 text-sm text-brand-nightText/45"><LoaderCircle size={15} className="animate-spin" />Loading confirmed parties…</p>
          : rows.length === 0 ? <p className="rounded-lg border border-white/10 bg-brand-nightSurface px-3 py-5 text-center text-sm text-brand-nightText/45">No upcoming confirmed parties.</p>
          : rows.map((row) => <article key={row.id} className="space-y-2 rounded-xl border border-white/[0.08] bg-brand-nightSurface px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-brand-nightText">{row.child_name} · {row.plan_name}</p><p className="mt-0.5 text-xs text-brand-nightText/55">{row.parent_name}</p></div><span className="rounded-full bg-brand-leaf/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-leaf">Confirmed</span></div>
            <div className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-brand-sky/20 bg-brand-sky/[0.06] px-3"><span className="flex min-w-0 items-center gap-2 text-sm font-semibold tabular-nums text-brand-skyLight"><CalendarClock size={14} className="shrink-0" /><span className="truncate">{dateTime(row.starts_at)}</span></span><span className="shrink-0 text-xs text-brand-nightText/50">{row.duration_minutes} min</span></div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-nightText/55"><span className="inline-flex items-center gap-1.5"><Users size={13} />{row.kids_count} kids · {row.adults_count} adults</span><span className="inline-flex items-center gap-1.5"><MapPin size={13} />{row.area_type === "entire_play_area" ? "Entire first floor" : "Party room"}</span><a className="inline-flex min-h-8 items-center gap-1.5 text-brand-skyLight" href={`tel:${row.phone}`}><Phone size={12} />{row.phone}</a></div>
            {row.custom_request && row.request_message && <p className="whitespace-pre-wrap rounded-lg border border-brand-coral/15 bg-brand-coral/[0.04] p-2.5 text-xs leading-5 text-brand-nightText/70">{row.request_message}</p>}
            <p className="text-xs font-medium text-brand-nightText/65">{row.plan_price == null ? row.admin_quote == null ? "Custom quote pending" : `Quote: ₹${Number(row.admin_quote).toLocaleString("en-IN")}` : `Plan price: ₹${Number(row.plan_price).toLocaleString("en-IN")}`}</p>
          </article>)}
        {rows.length === 100 && <p className="pt-1 text-center text-[11px] text-brand-nightText/40">Showing the next 100 confirmed parties.</p>}
      </div>
    </motion.div>}</AnimatePresence>
  </section>;
}
