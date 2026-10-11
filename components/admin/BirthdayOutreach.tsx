"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cake, ChevronDown, LoaderCircle, MessageCircle, Phone, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ContactMessageSheet from "@/components/shared/ContactMessageSheet";
import { expandCollapse } from "@/lib/motion";

type Birthday = {
  child_id: string;
  child_name: string;
  date_of_birth: string;
  birthday_on: string;
  days_until: number;
  parent_name: string;
  phone: string | null;
  secondary_phone: string | null;
};

const PAGE_SIZE = 30;
const birthdayDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function BirthdayOutreach({ embedded = false }: { embedded?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [opened, setOpened] = useState(false);
  const [birthdayCount, setBirthdayCount] = useState<number | null>(null);
  const [rows, setRows] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [messageTo, setMessageTo] = useState<Birthday | null>(null);
  const initialLoadStarted = useRef(false);

  useEffect(() => {
    let active = true;
    void supabase.rpc("admin_upcoming_child_birthday_count").then(({ data, error: countError }) => {
      if (!active || countError || typeof data !== "number") return;
      setBirthdayCount(data);
    });
    return () => { active = false; };
  }, [supabase]);

  const loadPage = useCallback(async (offset: number) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase.rpc("admin_upcoming_child_birthdays", {
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (queryError) {
      setError(queryError.message);
    }
    else {
      const page = (data as Birthday[]) ?? [];
      setRows((current) => offset ? [...current, ...page] : page);
      setHasMore(page.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [loading, supabase]);

  useEffect(() => {
    if (!opened || initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadPage(0);
  }, [opened, loadPage]);

  const toggle = () => setOpened((value) => !value);

  const visibleRows = rows.filter((row) =>
    `${row.child_name} ${row.parent_name} ${row.phone ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return <section className={embedded ? "border-t border-brand-coral/15 pt-3" : "overflow-hidden rounded-2xl border border-white/[0.08] bg-brand-nightSurface"}>
    <button type="button" aria-expanded={opened} onClick={toggle} className={`flex w-full items-center gap-3 text-left ${embedded ? "min-h-12 rounded-xl bg-brand-coral/[0.05] px-3" : "min-h-14 border-b border-white/[0.06] px-4 sm:px-5"}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${embedded ? "bg-brand-coral/10 text-brand-coral" : "h-9 w-9 rounded-xl bg-brand-sun/15 text-brand-sun"}`}><Cake size={16} /></span>
      <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-nightText">Upcoming birthdays <span className="rounded-full bg-brand-sky/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-skyLight">Unregistered</span></span><span className="block text-xs text-brand-nightText/40">Outreach list · no active party request or booking</span></span>
      {birthdayCount !== null && <span aria-label={`${birthdayCount} birthdays in the next 30 days`} className="rounded-full bg-brand-sun/10 px-2.5 py-1 text-xs font-bold tabular-nums text-brand-sun">{birthdayCount}</span>}
      <ChevronDown size={16} className={`shrink-0 text-brand-nightText/40 transition-transform ${opened ? "rotate-180" : ""}`} />
    </button>
    <AnimatePresence initial={false}>{opened && <motion.div {...expandCollapse} className="overflow-hidden">
      <div className={`space-y-3 ${embedded ? "pt-3" : "border-t border-white/[0.05] p-3 sm:p-5"}`}>
        <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-nightText/35" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter loaded birthdays" aria-label="Filter birthday results" className="min-h-10 w-full rounded-xl border border-white/10 bg-brand-nightSurface2 pl-9 pr-3 text-sm text-brand-nightText outline-none placeholder:text-brand-nightText/35 focus:border-brand-sky/40" /></div>
        {error && <p role="alert" className="rounded-xl border border-brand-coral/20 bg-brand-coral/5 px-3 py-2 text-sm text-brand-coral">Could not load birthdays: {error}</p>}
        {error && <button type="button" onClick={() => void loadPage(0)} className="min-h-9 rounded-lg border border-brand-coral/25 px-3 text-xs font-semibold text-brand-coral">Retry</button>}
        {loading && rows.length === 0 ? <p className="flex items-center justify-center gap-2 py-8 text-sm text-brand-nightText/45"><LoaderCircle size={15} className="animate-spin" />Loading birthday list…</p>
          : error ? null : visibleRows.length === 0 ? <p className="rounded-xl border border-white/10 bg-brand-nightSurface2 px-4 py-6 text-center text-sm text-brand-nightText/45">{rows.length ? "No loaded results match your search." : "No birthdays coming up in the next 30 days."}</p>
          : <div className="space-y-2">{visibleRows.map((row) => {
            const phone = row.phone || row.secondary_phone;
            const message = "Hi {{parent_name}}, {{child_name}}'s birthday is coming up on {{birthday_date}}. We'd love to help you plan a fun celebration at {{business_name}}. Reply here if you'd like to hear about our party options!";
            return <article key={row.child_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-brand-nightSurface2 px-3 py-3 sm:px-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-sun/10 text-brand-sun"><Cake size={15} /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-brand-nightText">{row.child_name}<span className="ml-2 rounded-full bg-brand-sun/10 px-2 py-0.5 text-[10px] font-bold text-brand-sun">{birthdayDate(row.birthday_on)}{row.days_until === 0 ? " · Today" : ` · ${row.days_until}d`}</span></p><p className="mt-0.5 truncate text-xs text-brand-nightText/45">{row.parent_name}{phone ? ` · ${phone}` : " · No phone number"}</p></div>
              {phone && <div className="flex shrink-0 items-center gap-1.5"><a href={`tel:${phone}`} aria-label={`Call ${row.parent_name}`} className="grid h-9 w-9 place-items-center rounded-lg border border-brand-sky/25 text-brand-skyLight hover:bg-brand-sky/10"><Phone size={15} /></a><button type="button" onClick={() => setMessageTo(row)} aria-label={`Message ${row.parent_name}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-sky px-3 text-xs font-semibold text-brand-ink hover:brightness-105"><MessageCircle size={14} />Message</button></div>}
              {messageTo?.child_id === row.child_id && <ContactMessageSheet open onClose={() => setMessageTo(null)} title={`Birthday message for ${row.child_name}`} phone={phone ?? ""} initialMessage={message} templateKey="birthday_outreach" templateValues={{ parent_name: row.parent_name, child_name: row.child_name, birthday_date: birthdayDate(row.birthday_on), business_name: "QureoCity" }} canManageTemplates />}
            </article>;
          })}</div>}
        {hasMore && <button type="button" disabled={loading} onClick={() => void loadPage(rows.length)} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-sm font-semibold text-brand-nightText/70 transition-colors hover:bg-white/[0.04] disabled:opacity-50">{loading && <LoaderCircle size={14} className="animate-spin" />}Load more birthdays</button>}
      </div>
    </motion.div>}</AnimatePresence>
  </section>;
}
