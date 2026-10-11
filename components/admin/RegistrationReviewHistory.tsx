"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, History, CalendarClock, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PhoneLinks from "@/components/shared/PhoneLinks";
import MessageButton from "@/components/shared/MessageButton";
import ListRow from "@/components/shared/ListRow";
import { expandCollapse } from "@/lib/motion";

type Review = {
  id: string; name: string; kind: string; status: string; reviewed_at: string;
  reviewed_by: string | null; parent_name: string | null; phone: string | null;
  secondary_phone: string | null; plan_name: string | null; child_id: string | null;
};
const decisionLabel: Record<string, string> = { confirmed: "Approved", discarded: "Declined", cancelled: "Declined / cancelled", quoted: "Quote prepared" };

export default function RegistrationReviewHistory() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Review[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);
  const [hasMore, setHasMore] = useState(false);

  const load = async (nextLimit = limit) => {
    if (loading) return;
    setLoading(true);
    const supabase = createClient();
    const [registrations, bookings] = await Promise.all([
      supabase.from("membership_registrations").select("*").in("status", ["confirmed", "discarded"]).not("reviewed_at", "is", null).order("reviewed_at", { ascending: false }).limit(nextLimit),
      supabase.from("party_bookings").select("*").in("status", ["confirmed", "cancelled", "quoted"]).not("reviewed_at", "is", null).order("reviewed_at", { ascending: false }).limit(nextLimit),
    ]);
    const regRows = registrations.data ?? [];
    const partyRows = bookings.data ?? [];
    const childIds = [...new Set(regRows.flatMap((r) => [r.child_id, r.renewal_child_id]).filter((id): id is string => typeof id === "string"))];
    const customerIds = [...new Set(regRows.map((r) => r.renewal_customer_id).filter((id): id is string => typeof id === "string"))];
    const planIds = [...new Set(regRows.map((r) => r.plan_id).filter((id): id is string => typeof id === "string"))];
    const [childrenResult, customersResult, plansResult, employeesResult] = await Promise.all([
      childIds.length ? supabase.from("children").select("id, name").in("id", childIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      customerIds.length ? supabase.from("customers").select("id, name, phone, secondary_phone").in("id", customerIds) : Promise.resolve({ data: [] as { id: string; name: string; phone: string; secondary_phone: string | null }[] }),
      planIds.length ? supabase.from("membership_plans").select("id, name").in("id", planIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      (() => {
        const ids = [...new Set([...regRows, ...partyRows].map((r) => r.reviewed_by).filter((id): id is string => typeof id === "string"))];
        return ids.length ? supabase.from("employees").select("id, name").in("id", ids) : Promise.resolve({ data: [] as { id: string; name: string }[] });
      })(),
    ]);
    const childNames = Object.fromEntries((childrenResult.data ?? []).map((child) => [child.id, child.name]));
    const customers = Object.fromEntries((customersResult.data ?? []).map((customer) => [customer.id, customer]));
    const planNames = Object.fromEntries((plansResult.data ?? []).map((plan) => [plan.id, plan.name]));
    const items: Review[] = [
      ...regRows.map((r) => ({
        id: r.id, name: (r.child_id && childNames[r.child_id]) || (r.renewal_child_id && childNames[r.renewal_child_id]) || r.child_name || "Child",
        kind: r.registration_type === "special" ? "Special day" : r.registration_type === "renewal" ? "Renewal" : "Membership",
        status: r.status, reviewed_at: r.reviewed_at!, reviewed_by: r.reviewed_by,
        parent_name: r.parent_name ?? customers[r.renewal_customer_id]?.name ?? null, phone: r.phone ?? customers[r.renewal_customer_id]?.phone ?? null,
        secondary_phone: r.secondary_phone ?? customers[r.renewal_customer_id]?.secondary_phone ?? null, plan_name: r.plan_name_snapshot ?? (r.plan_id ? planNames[r.plan_id] : null) ?? null, child_id: r.child_id ?? r.renewal_child_id ?? null,
      })),
      ...partyRows.map((r) => ({
        id: r.id, name: r.child_name || "Party booking", kind: "Party", status: r.status,
        reviewed_at: r.reviewed_at!, reviewed_by: r.reviewed_by, parent_name: r.parent_name ?? null,
        phone: r.phone ?? null, secondary_phone: null, plan_name: r.plan_name ?? null, child_id: r.child_id ?? null,
      })),
    ].sort((a, b) => Date.parse(b.reviewed_at) - Date.parse(a.reviewed_at));
    setHasMore(regRows.length === nextLimit || partyRows.length === nextLimit);
    items.splice(nextLimit);
    setLimit(nextLimit);
    setRows(items);
    setNames(Object.fromEntries((employeesResult.data ?? []).map((employee) => [employee.id, employee.name])));
    setLoading(false);
  };

  const toggle = () => { const next = !open; setOpen(next); if (next) void load(); };

  return <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-brand-nightSurface">
    <button type="button" aria-expanded={open} onClick={toggle} className="flex min-h-14 w-full items-center gap-3 px-4 text-left sm:px-5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.04] text-brand-nightText/45"><History size={15} /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-brand-nightText/75">Recent registration decisions</span><span className="block text-xs text-brand-nightText/35">Who approved or declined each request</span></span>
      <ChevronDown size={16} className={`text-brand-nightText/40 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    <AnimatePresence initial={false}>{open && <motion.div {...expandCollapse} className="overflow-hidden"><div className="space-y-2 border-t border-white/[0.07] p-3 sm:p-5">
      {loading ? <p className="py-4 text-center text-sm text-brand-nightText/40">Loading decisions…</p> : rows.length === 0 ? <p className="py-4 text-center text-sm text-brand-nightText/40">No reviewed registrations yet.</p> : rows.map((row) => {
        const rowKey = `${row.kind}-${row.id}`;
        const link = row.phone ? `/admin?tab=directory&customer=${encodeURIComponent(row.phone)}${row.child_id ? `&child=${encodeURIComponent(row.child_id)}` : ""}` : null;
        return <ListRow key={rowKey} title={row.name} subtitle={`${row.kind} · ${new Date(row.reviewed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`} statusDot={row.status === "confirmed" ? "leaf" : row.status === "quoted" ? "sky" : "coral"}
          safetyFlag={<span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${row.status === "confirmed" ? "bg-brand-leaf/10 text-brand-leaf" : row.status === "quoted" ? "bg-brand-sky/10 text-brand-skyLight" : "bg-brand-coral/10 text-brand-coral"}`}>{decisionLabel[row.status] ?? row.status}</span>}
          expanded={expandedId === rowKey} onToggleExpand={() => setExpandedId(expandedId === rowKey ? null : rowKey)}
          expandedContent={<div className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="text-brand-nightText/65"><span className="text-xs uppercase text-brand-nightText/35">Parent</span><br />{row.parent_name || "Parent details unavailable"}</p>
              <p className="text-brand-nightText/65"><span className="text-xs uppercase text-brand-nightText/35">Plan</span><br />{row.plan_name || (row.kind === "Party" ? "Party booking" : "Plan details unavailable")}</p>
              <p className="flex items-center gap-2 text-xs text-brand-nightText/45"><CalendarClock size={13} /> Reviewed {new Date(row.reviewed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{row.reviewed_by ? ` · ${names[row.reviewed_by] ?? "Admin"}` : ""}</p>
              {row.phone && <div className="flex flex-wrap items-center gap-2"><PhoneLinks phone={row.phone} secondaryPhone={row.secondary_phone} showNumber showCallButton /><MessageButton phone={row.phone} parentName={row.parent_name ?? ""} childName={row.name} showLabel canManageTemplates /></div>}
            </div>
            {link && <a href={link} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-sky/25 bg-brand-sky/10 px-3 text-xs font-semibold text-brand-skyLight"><ExternalLink size={13} /> View customer details</a>}
          </div>} />;
      })}
      {hasMore && !loading && <button type="button" onClick={() => void load(limit + 10)} className="mt-2 min-h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-brand-nightText/60 hover:border-brand-sky/30 hover:text-brand-skyLight">Load 10 more</button>}
    </div></motion.div>}</AnimatePresence>
  </section>;
}
