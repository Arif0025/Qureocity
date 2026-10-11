"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, PartyPopper, Users, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ContactMessageSheet from "@/components/shared/ContactMessageSheet";
import type { MessageTemplateEvent, MessageTemplateValues } from "@/lib/message-template-format";
import BirthdayOutreach from "./BirthdayOutreach";
import UpcomingConfirmedParties from "./UpcomingConfirmedParties";

type Booking = {
  id: string; plan_name: string; plan_price: number | null; area_type: "party_room" | "entire_play_area";
  kids_count: number; adults_count: number; duration_minutes: number; parent_name: string;
  phone: string; child_name: string; custom_request: boolean; request_message: string | null;
  admin_quote: number | null; starts_at: string; ends_at: string; status: "pending" | "quoted";
};
type Draft = { booking: Booking; message: string; declined?: boolean; templateKey: MessageTemplateEvent; values: MessageTemplateValues; preferredTemplateName?: string };
const dateTime = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

export default function PartyBookingRequests() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase.from("party_bookings")
      .select("id, plan_name, plan_price, area_type, kids_count, adults_count, duration_minutes, parent_name, phone, child_name, custom_request, request_message, admin_quote, starts_at, ends_at, status")
      .in("status", ["pending", "quoted"])
      .order("starts_at", { ascending: true }).limit(100);
    if (queryError) setError(queryError.message);
    else setRows((data as Booking[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
    const channel = supabase.channel(`party-notifications-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_bookings" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, supabase]);

  const setStatus = async (booking: Booking, status: "confirmed" | "cancelled" | "quoted", quoteAmount?: number) => {
    setBusy(booking.id); setError(null);
    const { error: updateError } = await supabase.from("party_bookings")
      .update({ status, ...(quoteAmount === undefined ? {} : { admin_quote: quoteAmount }) }).eq("id", booking.id);
    setBusy(null);
    if (updateError) { setError(updateError.message); return; }
    await load();
    const values = { parent_name: booking.parent_name, child_name: booking.child_name, plan_name: booking.plan_name, party_datetime: dateTime(booking.starts_at), quote_amount: quoteAmount == null ? String(booking.admin_quote ?? "") : `₹${quoteAmount.toLocaleString("en-IN")}`, business_name: "QureoCity" };
    if (status === "cancelled") {
      setDraft({ booking, declined: true, templateKey: "party_declined", preferredTemplateName: "We’re unavailable", values, message: "Hi {{parent_name}}, unfortunately we’re unable to host {{child_name}}'s party on {{party_datetime}}. Please reply if you would like to discuss another date or have any questions." });
    } else if (status === "confirmed") {
      setDraft({ booking, templateKey: "party_approved", values, message: "Hi {{parent_name}}, {{child_name}}'s party booking for {{plan_name}} is approved for {{party_datetime}}. We look forward to celebrating with you!" });
    } else if (quoteAmount !== undefined) {
      setDraft({ booking, templateKey: "party_quote", values, message: "Hi {{parent_name}}, we have prepared a quote of {{quote_amount}} for {{child_name}}'s party request. Requested start: {{party_datetime}}. Please reply if you would like to discuss or confirm it." });
      setQuote((current) => ({ ...current, [booking.id]: String(quoteAmount) }));
    }
  };

  const sendQuote = (booking: Booking) => {
    const amount = Number(quote[booking.id]);
    if (!Number.isFinite(amount) || amount < 0) { setError("Enter a valid quote amount first."); return; }
    void setStatus(booking, "quoted", amount);
  };

  return <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-brand-nightSurface">
    <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-5"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-coral/10 text-brand-coral"><PartyPopper size={17} /></span><div><h2 className="font-semibold text-brand-nightText">Party requests</h2><p className="text-xs text-brand-nightText/45">Review requests and prepare a response message.</p></div></div><span aria-label={`${rows.length} party requests`} className="grid h-8 min-w-8 place-items-center rounded-full bg-brand-sun/15 px-2.5 text-sm font-bold tabular-nums text-brand-sun">{rows.length}</span></header>
    <div className="space-y-2.5 p-3 sm:p-5">
      {error && <p role="alert" className="rounded-xl border border-brand-coral/20 bg-brand-coral/5 px-3 py-2 text-sm text-brand-coral">{error}</p>}
      {loading ? <p className="py-6 text-center text-sm text-brand-nightText/40">Loading party requests…</p> : rows.length === 0 ? <p className="rounded-xl border border-white/10 bg-brand-nightSurface2 px-4 py-6 text-center text-sm text-brand-nightText/45">No party requests need a response.</p> : rows.map((booking) => <article key={booking.id} className="rounded-xl border border-white/10 bg-brand-nightSurface2 p-3.5 sm:p-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3"><p className="min-w-0 font-semibold text-brand-nightText">{booking.child_name} · {booking.plan_name}</p><span className="shrink-0 rounded-full bg-brand-sun/15 px-2 py-1 text-[10px] font-bold uppercase text-brand-sun">{booking.status}</span></div>
          <div className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-brand-sky/25 bg-brand-sky/10 px-3 text-sm font-semibold tabular-nums text-brand-skyLight"><span className="flex min-w-0 items-center gap-2"><CalendarClock size={15} className="shrink-0" /><span className="truncate">{dateTime(booking.starts_at)}</span></span><span className="shrink-0 rounded-md bg-brand-nightSurface/40 px-2 py-1 text-xs font-medium text-brand-nightText/60">{booking.duration_minutes} min</span></div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-brand-nightText/50"><span>{booking.parent_name} · {booking.phone}</span><a aria-label={`Call ${booking.phone}`} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-brand-sky/25 bg-brand-sky/10 px-2.5 text-xs font-semibold text-brand-skyLight" href={`tel:${booking.phone}`}><Phone size={12} />Call</a></p>
          <p className="flex items-center gap-1.5 text-xs text-brand-nightText/50"><Users size={13} />{booking.kids_count} kids · {booking.adults_count} adults · {booking.area_type === "entire_play_area" ? "Entire first floor" : "Party room"}</p>
        </div>
        {booking.custom_request && booking.request_message && <p className="mt-3 whitespace-pre-wrap rounded-lg border border-brand-coral/15 bg-brand-coral/5 p-3 text-xs leading-5 text-brand-nightText/75">{booking.request_message}</p>}
        {booking.status === "pending" && <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-white/8 pt-3">{booking.custom_request && <input aria-label={`Quote for ${booking.child_name}`} type="number" min="0" step="1" placeholder="Quote ₹" value={quote[booking.id] ?? (booking.admin_quote == null ? "" : String(booking.admin_quote))} onChange={(event) => setQuote((current) => ({ ...current, [booking.id]: event.target.value }))} className="min-h-9 w-28 rounded-lg border border-white/15 bg-brand-nightSurface px-2 text-xs text-brand-nightText" />}<button type="button" disabled={busy === booking.id} onClick={() => void setStatus(booking, "cancelled")} className="min-h-9 rounded-lg border border-brand-coral/25 px-3 text-xs font-semibold text-brand-coral disabled:opacity-50">Decline</button>{booking.custom_request ? <button type="button" disabled={busy === booking.id} onClick={() => sendQuote(booking)} className="min-h-9 rounded-lg bg-brand-sky px-3 text-xs font-semibold text-white disabled:opacity-50">Prepare quote</button> : <button type="button" disabled={busy === booking.id} onClick={() => void setStatus(booking, "confirmed")} className="min-h-9 rounded-lg bg-brand-leaf px-3 text-xs font-semibold text-brand-ink disabled:opacity-50">Approve &amp; message</button>}</div>}
      {booking.status === "quoted" && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3"><p className="text-sm font-bold text-brand-nightText">Quote: ₹{Number(booking.admin_quote).toLocaleString("en-IN")}</p><div className="flex gap-2"><button type="button" onClick={() => setDraft({ booking, templateKey: "party_quote", values: { parent_name: booking.parent_name, child_name: booking.child_name, plan_name: booking.plan_name, party_datetime: dateTime(booking.starts_at), quote_amount: `₹${Number(booking.admin_quote).toLocaleString("en-IN")}`, business_name: "QureoCity" }, message: "Hi {{parent_name}}, we have prepared a quote of {{quote_amount}} for {{child_name}}'s party request. Requested start: {{party_datetime}}. Please reply if you would like to discuss or confirm it." })} className="min-h-9 rounded-lg border border-brand-sky/25 px-3 text-xs font-semibold text-brand-skyLight">Review/send quote</button><button type="button" disabled={busy === booking.id} onClick={() => void setStatus(booking, "confirmed")} className="min-h-9 rounded-lg bg-brand-leaf px-3 text-xs font-semibold text-brand-ink disabled:opacity-50">Approve booking</button><button type="button" disabled={busy === booking.id} onClick={() => void setStatus(booking, "cancelled")} className="min-h-9 rounded-lg border border-brand-coral/25 px-3 text-xs font-semibold text-brand-coral disabled:opacity-50">Decline</button></div></div>}
      </article>)}
      <BirthdayOutreach embedded />
      <UpcomingConfirmedParties />
    </div>
    {draft && <ContactMessageSheet open onClose={() => setDraft(null)} title={draft.declined ? "Party request declined" : "Review party message"} phone={draft.booking.phone} initialMessage={draft.message} templateKey={draft.templateKey} templateValues={draft.values} canManageTemplates askBeforeSend={Boolean(draft.declined)} preferredTemplateName={draft.preferredTemplateName} />}
  </section>;
}
