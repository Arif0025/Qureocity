"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { todayISTDateString } from "@/lib/istTime";
import BottomSheet from "@/components/ui/BottomSheet";

function hasOpenWorkday(start: string, end: string): boolean {
  if (!start || !end || end < start) return false;
  const day = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (day <= last) {
    if (day.getUTCDay() !== 2) return true;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return false;
}

type LeaveRequest = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  paid_dates: string[];
  review_note: string | null;
  created_at: string;
};

const dateText = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

export default function EmployeeLeaveRequests() {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [startDate, setStartDate] = useState(todayISTDateString());
  const [endDate, setEndDate] = useState(todayISTDateString());
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const requestHasWorkday = hasOpenWorkday(startDate, endDate);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("employee_leave_overview");
    if (loadError) setError(loadError.message);
    else setRequests((data as LeaveRequest[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requestHasWorkday) {
      setError("Leave must include at least one open workday. The venue is closed on Tuesdays.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const { error: submitError } = await supabase.rpc("employee_submit_leave_request", {
      p_start_date: startDate,
      p_end_date: endDate,
      p_reason: reason,
    });
    setSaving(false);
    if (submitError) {
      setError(submitError.message);
      return;
    }
    setReason("");
    setNotice("Your leave request was sent to the admin.");
    await load();
  };

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-brand-nightText/45 transition hover:bg-white/[0.04] hover:text-brand-nightText/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky"
          aria-haspopup="dialog"
        >
          <CalendarPlus size={14} />
          Request leave
        </button>
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Leave requests">
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-brand-nightSurface">
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-sky/10 text-brand-skyLight"><CalendarPlus size={17} /></span>
        <div>
          <h2 className="text-sm font-semibold text-brand-nightText">Leave requests</h2>
          <p className="text-[11px] text-brand-nightText/40">Apply for time off and check its status.</p>
        </div>
      </header>
      <form onSubmit={submit} className="space-y-3 border-b border-white/[0.07] p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-brand-nightText/50">From
            <input required type="date" min={todayISTDateString()} value={startDate}
              onChange={(event) => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value); }}
              className="mt-1 min-h-10 w-full rounded-lg border border-white/15 bg-brand-nightSurface2 px-2 text-sm text-brand-nightText" />
          </label>
          <label className="text-[11px] text-brand-nightText/50">Through
            <input required type="date" min={startDate || todayISTDateString()} value={endDate} onChange={(event) => setEndDate(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-white/15 bg-brand-nightSurface2 px-2 text-sm text-brand-nightText" />
          </label>
        </div>
        <label className="block text-[11px] text-brand-nightText/50">Reason (optional)
          <textarea maxLength={1000} rows={2} value={reason} onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-brand-nightSurface2 p-2 text-sm text-brand-nightText" />
        </label>
        {error && <p role="alert" className="text-xs text-brand-coral">{error}</p>}
        {!requestHasWorkday && <p className="text-xs text-brand-coral">Leave must include at least one open workday. The venue is closed on Tuesdays.</p>}
        {notice && <p role="status" className="text-xs text-brand-leaf">{notice}</p>}
        <button type="submit" disabled={saving || !startDate || !endDate || !requestHasWorkday}
          className="min-h-10 rounded-lg bg-brand-sky px-4 text-xs font-semibold text-brand-ink disabled:opacity-50">
          {saving ? "Sending…" : "Submit leave request"}
        </button>
      </form>
      <div className="space-y-2 p-4">
        <p className="text-xs font-semibold text-brand-nightText/65">Your requests</p>
        {loading ? <p className="py-3 text-center text-xs text-brand-nightText/35">Loading…</p>
          : requests.length === 0 ? <p className="py-3 text-center text-xs text-brand-nightText/35">No leave requests yet.</p>
          : requests.map((request) => (
            <article key={request.id} className="rounded-xl border border-white/[0.08] bg-brand-nightSurface2/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-brand-nightText">{dateText(request.start_date)} – {dateText(request.end_date)}</p>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${request.status === "approved" ? "bg-brand-leaf/10 text-brand-leaf" : request.status === "rejected" ? "bg-brand-coral/10 text-brand-coral" : "bg-brand-sun/10 text-brand-sun"}`}>
                  {request.status === "rejected" ? "Declined" : request.status === "pending" ? "Pending" : "Approved"}
                </span>
              </div>
              {request.reason && <p className="mt-1 text-xs text-brand-nightText/45">{request.reason}</p>}
              {request.status === "approved" && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-brand-nightText/50">
                <Clock3 size={12} className="mt-0.5 shrink-0" />
                {request.paid_dates?.length ? `Paid leave: ${request.paid_dates.map(dateText).join(", ")}` : "Approved as unpaid leave."}
              </p>}
              {request.review_note && <p className="mt-2 text-[11px] text-brand-nightText/45">Admin note: {request.review_note}</p>}
            </article>
          ))}
      </div>
    </section>
      </BottomSheet>
    </>
  );
}

