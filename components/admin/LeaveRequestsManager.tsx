"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Check, ChevronDown, Clock3, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { expandCollapse } from "@/lib/motion";

type LeaveRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  salary_type: "monthly" | "hourly" | null;
  scheduled_shift_hours: number | null;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  paid_dates: string[];
  review_note: string | null;
  created_at: string;
  paid_days_this_month?: number;
};

function datesBetween(start: string, end: string) {
  const result: string[] = [];
  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (current <= last && result.length < 92) {
    if (current.getUTCDay() !== 2) result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}
const dateText = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function LeaveRequestsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [paidDates, setPaidDates] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [paidDaysThisMonth, setPaidDaysThisMonth] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const [{ data, error: loadError }, { data: paidRows, error: paidError }] = await Promise.all([
      supabase.rpc("admin_leave_overview"),
      supabase.rpc("admin_paid_leave_days_this_month"),
    ]);
    if (loadError || paidError) setError((loadError ?? paidError)?.message ?? "Could not load leave totals.");
    else {
      const overview = data as { reminder_days: number; requests: LeaveRequest[] };
      setRequests(overview.requests ?? []);
      const paidCounts: Record<string, number> = {};
      for (const row of (paidRows ?? []) as { employee_id: string; paid_days: number }[]) {
        paidCounts[row.employee_id] = row.paid_days;
      }
      setPaidDaysThisMonth(paidCounts);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session?.user.id) return;
      channel = supabase.channel("admin-leave-requests")
        .on("postgres_changes", { event: "*", schema: "public", table: "employee_leave_requests" }, () => { void load(); })
        .subscribe();
    });
    return () => { active = false; if (channel) void supabase.removeChannel(channel); };
  }, [supabase, load]);

  const review = async (request: LeaveRequest, decision: "approved" | "rejected") => {
    setBusy(request.id); setError(null); setNotice(null);
    const { error: reviewError } = await supabase.rpc("admin_review_leave_request", {
      p_request_id: request.id,
      p_decision: decision,
      p_paid_dates: decision === "approved" ? (paidDates[request.id] ?? []) : [],
      p_review_note: notes[request.id] ?? "",
    });
    setBusy(null);
    if (reviewError) setError(reviewError.message);
    else { setNotice(decision === "approved" ? "Leave approved." : "Leave declined."); await load(); }
  };

  const pending = requests.filter((request) => request.status === "pending");
  const reviewed = requests.filter((request) => request.status !== "pending");

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-sky/20 bg-brand-nightSurface">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex min-h-16 w-full items-center gap-3 bg-brand-sky/[0.06] px-4 py-4 text-left sm:px-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-sky/15 text-brand-skyLight"><CalendarDays size={19} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-brand-nightText">Staff leave</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-brand-nightText/45">Review requests and set paid dates for approved leave.</p>
        </div>
        {pending.length > 0 && <span aria-label={`${pending.length} pending staff leave requests`} className="grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-brand-sun/15 px-2.5 text-xs font-bold tabular-nums text-brand-sun">{pending.length}</span>}
        <ChevronDown size={17} className={`shrink-0 text-brand-nightText/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>{open && <motion.div {...expandCollapse} className="overflow-hidden">
      <div className="space-y-4 border-t border-white/[0.07] p-3 sm:p-5">
        {error && <p role="alert" className="text-xs text-brand-coral">{error}</p>}
        {notice && <p role="status" className="text-xs text-brand-leaf">{notice}</p>}
        {loading ? <p className="py-5 text-center text-xs text-brand-nightText/35">Loading leave requests…</p>
          : requests.length === 0 ? <p className="py-5 text-center text-xs text-brand-nightText/35">No leave requests.</p>
          : <div className="space-y-3">
            {pending.map((request) => {
              const workdays = datesBetween(request.start_date, request.end_date);
              const selected = paidDates[request.id] ?? [];
              return <article key={request.id} className="rounded-xl border border-brand-sun/20 bg-brand-sun/[0.03] p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="text-sm font-semibold text-brand-nightText">{request.employee_name}</p>
                    <p className="mt-1 text-xs text-brand-nightText/55">{dateText(request.start_date)} – {dateText(request.end_date)}</p>
                    <p className="mt-1 text-[11px] font-medium text-sky-300">{paidDaysThisMonth[request.employee_id] ?? 0} paid leave day{(paidDaysThisMonth[request.employee_id] ?? 0) === 1 ? "" : "s"} this month</p></div>
                  <span className="rounded-full bg-brand-sun/10 px-2 py-1 text-[10px] font-semibold text-brand-sun">Pending review</span>
                </div>
                {request.reason && <p className="mt-2 whitespace-pre-wrap text-xs text-brand-nightText/55">{request.reason}</p>}
                <fieldset className="mt-3 rounded-lg border border-white/[0.08] p-2.5">
                  <legend className="px-1 text-[11px] font-semibold text-brand-nightText/65">Paid dates (select any days to pay)</legend>
                  {workdays.length === 0 ? <p className="text-[11px] text-brand-nightText/40">This request only includes closed Tuesdays; there are no scheduled paid days.</p>
                    : <div className="flex flex-wrap gap-2">{workdays.map((day) => {
                      const checked = selected.includes(day);
                      return <label key={day} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-2 text-[11px] ${checked ? "border-brand-leaf/40 bg-brand-leaf/10 text-brand-leaf" : "border-white/10 text-brand-nightText/55"}`}>
                        <input type="checkbox" checked={checked} onChange={(event) => setPaidDates((current) => ({
                          ...current, [request.id]: event.target.checked ? [...selected, day] : selected.filter((item) => item !== day),
                        }))} />
                        {dateText(day)}
                      </label>;
                    })}</div>}
                  <p className="mt-2 text-[10px] text-brand-nightText/35">{request.salary_type === "hourly" ? request.scheduled_shift_hours == null ? "No shift is assigned, so paid dates will not add hourly pay." : `Paid dates credit ${request.scheduled_shift_hours} scheduled hours per day.` : "Paid dates count as worked days for the salary estimate."} Unselected dates remain unpaid.</p>
                </fieldset>
                <textarea maxLength={1000} rows={2} placeholder="Note to employee (optional)" value={notes[request.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                  className="mt-3 w-full rounded-lg border border-white/15 bg-brand-nightSurface2 p-2 text-xs text-brand-nightText" />
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" disabled={busy === request.id} onClick={() => void review(request, "rejected")}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-brand-coral/25 px-3 text-xs font-semibold text-brand-coral disabled:opacity-50"><X size={14} />Decline</button>
                  <button type="button" disabled={busy === request.id} onClick={() => void review(request, "approved")}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand-leaf px-3 text-xs font-semibold text-white disabled:opacity-50">{busy === request.id ? <Clock3 size={14} className="animate-spin" /> : <Check size={14} />}Approve</button>
                </div>
              </article>;
            })}
            {reviewed.length > 0 && <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-brand-nightText/60">Reviewed staff requests</p>
              {reviewed.map((request) => <article key={request.id} className="rounded-xl border border-white/[0.08] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-brand-nightText">{request.employee_name} · {dateText(request.start_date)} – {dateText(request.end_date)}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${request.status === "approved" ? "bg-brand-leaf/10 text-brand-leaf" : "bg-brand-coral/10 text-brand-coral"}`}>{request.status === "approved" ? "Approved" : "Declined"}</span>
                </div>
                <p className="mt-1 text-[11px] text-brand-nightText/45">{request.status === "approved" ? request.paid_dates?.length ? `Paid: ${request.paid_dates.map(dateText).join(", ")}` : "Unpaid leave" : "Request declined"}</p>
                {request.review_note && <p className="mt-1 text-[11px] text-brand-nightText/45">Note: {request.review_note}</p>}
              </article>)}
            </div>}
          </div>}
      </div>
      </motion.div>}</AnimatePresence>
    </section>
  );
}

