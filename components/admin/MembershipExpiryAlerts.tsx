"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, ChevronDown, LoaderCircle, MessageCircle, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ContactMessageSheet from "@/components/shared/ContactMessageSheet";
import { expandCollapse } from "@/lib/motion";

type ExpiryStatus = "expiring_soon" | "expired";
type ExpiryRow = {
  child_id: string;
  child_name: string;
  parent_name: string;
  phone: string | null;
  secondary_phone: string | null;
  plan_name: string;
  expires_on: string;
  days_remaining: number;
  date_of_birth: string;
};

const PAGE_SIZE = 30;
const expiryDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function MembershipExpiryAlerts({ embedded = false }: { embedded?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [opened, setOpened] = useState(false);
  const [counts, setCounts] = useState<{ expiring_soon: number; expired: number } | null>(null);
  const [status, setStatus] = useState<ExpiryStatus>("expiring_soon");
  const [rowsByStatus, setRowsByStatus] = useState<Partial<Record<ExpiryStatus, ExpiryRow[]>>>({});
  const requestedStatuses = useRef(new Set<ExpiryStatus>());
  const [hasMoreByStatus, setHasMoreByStatus] = useState<Partial<Record<ExpiryStatus, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageTo, setMessageTo] = useState<ExpiryRow | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.rpc("admin_membership_expiry_alert_counts").then(({ data, error: countError }) => {
      if (!active || countError || !data) return;
      const row = (Array.isArray(data) ? data[0] : data) as { expiring_soon?: unknown; expired?: unknown } | null;
      const expiringSoon = Number(row?.expiring_soon);
      const expired = Number(row?.expired);
      if (!Number.isFinite(expiringSoon) || !Number.isFinite(expired)) return;
      setCounts({ expiring_soon: expiringSoon, expired });
    });
    return () => { active = false; };
  }, [supabase]);

  const loadPage = useCallback(async (forStatus: ExpiryStatus, offset: number) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase.rpc("admin_membership_expiry_alerts", {
      p_status: forStatus,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (queryError) {
      setError(queryError.message);
    } else {
      const page = (data as ExpiryRow[]) ?? [];
      setRowsByStatus((current) => ({ ...current, [forStatus]: offset ? [...(current[forStatus] ?? []), ...page] : page }));
      setHasMoreByStatus((current) => ({ ...current, [forStatus]: page.length === PAGE_SIZE }));
    }
    setLoading(false);
  }, [loading, supabase]);

  useEffect(() => {
    if (opened && !requestedStatuses.current.has(status) && !loading) {
      requestedStatuses.current.add(status);
      void loadPage(status, 0);
    }
  }, [opened, status, loading, loadPage]);

  const rows = rowsByStatus[status] ?? [];
  const hasMore = hasMoreByStatus[status] ?? false;
  const setFilter = (next: ExpiryStatus) => { setError(null); setStatus(next); };

  return <section className={embedded ? "border-t border-brand-sun/15 pt-3" : "overflow-hidden rounded-2xl border border-white/[0.08] bg-brand-nightSurface"}>
    <button type="button" aria-expanded={opened} onClick={() => setOpened((value) => !value)} className={`flex w-full items-center gap-3 text-left ${embedded ? "min-h-12 rounded-xl bg-brand-sun/[0.06] px-3" : "min-h-14 border-b border-white/[0.06] px-4 sm:px-5"}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${embedded ? "bg-brand-sun/15 text-brand-sun" : "h-9 w-9 rounded-xl bg-brand-sun/15 text-brand-sun"}`}><CalendarClock size={16} /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-brand-nightText">Membership expiry</span><span className="block text-xs text-brand-nightText/40">Expiring within 7 days or already expired</span></span>
      {counts && <span aria-label={`${counts.expiring_soon} expiring soon, ${counts.expired} expired`} className="rounded-full bg-brand-sun/10 px-2.5 py-1 text-xs font-bold tabular-nums text-brand-sun">{counts.expiring_soon + counts.expired}</span>}
      <ChevronDown size={16} className={`shrink-0 text-brand-nightText/40 transition-transform ${opened ? "rotate-180" : ""}`} />
    </button>
    <AnimatePresence initial={false}>{opened && <motion.div {...expandCollapse} className="overflow-hidden">
      <div className={`space-y-3 ${embedded ? "pt-3" : "border-t border-white/[0.05] p-3 sm:p-5"}`}>
        <div role="group" aria-label="Membership expiry filter" className="grid grid-cols-2 gap-2 rounded-xl bg-brand-nightSurface2 p-1">
          <button type="button" aria-pressed={status === "expiring_soon"} onClick={() => setFilter("expiring_soon")} className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition-colors ${status === "expiring_soon" ? "bg-brand-sun/20 text-brand-sun" : "text-brand-nightText/50 hover:text-brand-nightText"}`}>Expiring soon <span className="hidden sm:inline">· 7 days</span>{counts && <span className="ml-1 tabular-nums">{counts.expiring_soon}</span>}</button>
          <button type="button" aria-pressed={status === "expired"} onClick={() => setFilter("expired")} className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition-colors ${status === "expired" ? "bg-brand-coral/15 text-brand-coral" : "text-brand-nightText/50 hover:text-brand-nightText"}`}>Expired{counts && <span className="ml-1 tabular-nums">{counts.expired}</span>}</button>
        </div>
        {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-coral/20 bg-brand-coral/5 px-3 py-2 text-sm text-brand-coral"><span>Could not load membership alerts: {error}</span><button type="button" onClick={() => { requestedStatuses.current.add(status); setError(null); void loadPage(status, 0); }} className="min-h-8 rounded-lg border border-brand-coral/25 px-2.5 text-xs font-semibold">Retry</button></div>}
        {loading && rows.length === 0 ? <p className="flex items-center justify-center gap-2 py-8 text-sm text-brand-nightText/45"><LoaderCircle size={15} className="animate-spin" />Loading membership alerts…</p>
          : error ? null : rows.length === 0 ? <p className="rounded-xl border border-white/10 bg-brand-nightSurface2 px-4 py-6 text-center text-sm text-brand-nightText/45">{status === "expiring_soon" ? "No memberships expire in the next 7 days." : "No expired memberships to show."}</p>
          : <div className="space-y-2">{rows.map((row) => {
            const phone = row.phone || row.secondary_phone;
            const dateText = expiryDate(row.expires_on);
            const message = "Hi {{parent_name}}! Just a heads up that {{child_name}}'s membership at {{business_name}} expires on {{expiry_date}}. Renew anytime at the front desk to keep the fun going!";
            return <article key={row.child_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-brand-nightSurface2 px-3 py-3 sm:px-4">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${status === "expired" ? "bg-brand-coral/10 text-brand-coral" : "bg-brand-sun/10 text-brand-sun"}`}><CalendarClock size={15} /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="truncate text-sm font-semibold text-brand-nightText">{row.child_name}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status === "expired" ? "bg-brand-coral/10 text-brand-coral" : "bg-brand-sun/10 text-brand-sun"}`}>{status === "expired" ? "Expired" : row.days_remaining === 0 ? "Expires today" : `${row.days_remaining}d left`}</span></div><p className="mt-0.5 truncate text-xs text-brand-nightText/50">{row.plan_name} · ends {dateText}</p><p className="mt-0.5 truncate text-xs text-brand-nightText/40">{row.parent_name}{phone ? ` · ${phone}` : " · No phone number"}</p></div>
              {phone && <div className="flex shrink-0 items-center gap-1.5"><a href={`tel:${phone}`} aria-label={`Call ${row.parent_name}`} className="grid h-9 w-9 place-items-center rounded-lg border border-brand-sky/25 text-brand-skyLight hover:bg-brand-sky/10"><Phone size={15} /></a><button type="button" onClick={() => setMessageTo(row)} aria-label={`Message ${row.parent_name}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-sky px-3 text-xs font-semibold text-brand-ink hover:brightness-105"><MessageCircle size={14} />Message</button></div>}
              {messageTo?.child_id === row.child_id && <ContactMessageSheet open onClose={() => setMessageTo(null)} title={`Membership reminder for ${row.child_name}`} phone={phone ?? ""} initialMessage={message} templateKey="membership_expiry" templateValues={{ parent_name: row.parent_name, child_name: row.child_name, date_of_birth: row.date_of_birth, expiry_date: dateText, business_name: "QureoCity" }} canManageTemplates />}
            </article>;
          })}</div>}
        {hasMore && <button type="button" disabled={loading} onClick={() => void loadPage(status, rows.length)} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-sm font-semibold text-brand-nightText/70 transition-colors hover:bg-white/[0.04] disabled:opacity-50">{loading && <LoaderCircle size={14} className="animate-spin" />}Load more</button>}
      </div>
    </motion.div>}</AnimatePresence>
  </section>;
}
