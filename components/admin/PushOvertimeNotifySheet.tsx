"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, LoaderCircle } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { createClient } from "@/lib/supabase/client";

type Staff = { id: string; name: string };
type Overdue = { session_id: string; child_name: string; minutes_overdue: number };

export default function PushOvertimeNotifySheet({
  sessionId, staff, onClose,
}: { sessionId: string; staff: Staff[]; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [overdue, setOverdue] = useState<Overdue | null>(null);
  const [onDuty, setOnDuty] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.rpc("admin_list_overdue_sessions"),
      supabase.from("attendance_logs").select("employee_id").is("punch_out", null),
    ]).then(([overdueResult, dutyResult]) => {
      if (!active) return;
      const rows = (overdueResult.data as Overdue[] | null) ?? [];
      setOverdue(rows.find((row) => row.session_id === sessionId) ?? null);
      setOnDuty([...new Set(((dutyResult.data as { employee_id: string }[] | null) ?? []).map((row) => row.employee_id))]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [sessionId, supabase]);

  const send = async (employee: Staff) => {
    if (!overdue) return;
    setSendingTo(employee.id);
    setResult(null);
    try {
      const response = await fetch("/api/push/manual-notify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          title: "Please check a child out",
          message: `Hi ${employee.name}, ${overdue.child_name}'s session ended ${overdue.minutes_overdue} min ago and they're still showing as checked in — please check on them when you get a moment.`,
        }),
      });
      const data = await response.json().catch(() => ({})) as { sent?: number; error?: string };
      setResult(response.ok ? `Sent to ${employee.name}${data.sent === 0 ? " (no active push devices)" : "."}` : data.error ?? "Could not send the notification.");
    } catch {
      setResult("Could not reach the server.");
    }
    setSendingTo(null);
  };

  return <BottomSheet open onClose={onClose} title="Notify staff about overtime">
    <div className="space-y-3">
      {loading ? <p className="flex items-center justify-center gap-2 py-6 text-sm text-brand-nightText/50"><LoaderCircle size={16} className="animate-spin" />Checking the current session…</p>
        : !overdue ? <p className="rounded-xl border border-brand-sun/20 bg-brand-sun/5 p-3 text-sm text-brand-nightText/70">This session is no longer overdue.</p>
        : <><p className="rounded-xl border border-brand-coral/20 bg-brand-coral/5 p-3 text-sm text-brand-nightText"><strong>{overdue.child_name}</strong> is {overdue.minutes_overdue} minutes over session time. Choose an on-duty team member to notify.</p>
          {staff.filter((employee) => onDuty.includes(employee.id)).length === 0 ? <p className="text-sm text-brand-nightText/50">No team members are currently punched in.</p> : staff.filter((employee) => onDuty.includes(employee.id)).map((employee) => <button key={employee.id} type="button" disabled={!!sendingTo} onClick={() => void send(employee)} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-brand-nightSurface2 px-3 text-left text-sm font-semibold text-brand-nightText disabled:opacity-50"><span>{employee.name}</span><span className="inline-flex items-center gap-1 text-xs text-brand-sun">{sendingTo === employee.id ? <LoaderCircle size={13} className="animate-spin" /> : <Bell size={13} />}Notify</span></button>)}</>}
      {result && <p role="status" className="text-sm text-brand-leaf">{result}</p>}
    </div>
  </BottomSheet>;
}
