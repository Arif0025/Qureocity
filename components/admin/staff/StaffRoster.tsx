"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, Clock, KeyRound, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resetEmployeePassword } from "@/app/admin/actions";
import EmployeeCalendar from "./EmployeeCalendar";
import ShiftEditor from "./ShiftEditor";
import AddEmployeeModal from "../AddEmployeeModal";

const CLOSED_WEEKDAY = 2; // Tuesday

type Staff = { id: string; name: string; role: string };
type Shift = {
  id: string;
  employee_id: string;
  start_time: string;
  end_time: string;
  notes: string | null;
};
type Summary = {
  employee_id: string;
  employee_name: string;
  role: string;
  actual_working_days: number;
  total_hours_this_month: number;
};
type LogRow = { id: string; punch_in: string; punch_out: string | null };

// Open days elapsed so far this month (venue is closed Tuesdays) — the
// "total working days" half of the attendance glimpse.
function openDaysElapsedThisMonth(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  let count = 0;
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== CLOSED_WEEKDAY) count++;
  }
  return count;
}

export default function StaffRoster({
  staff,
  initialShifts,
  isAdmin,
  activeEmployeeId,
}: {
  staff: Staff[];
  initialShifts: Shift[];
  isAdmin: boolean;
  activeEmployeeId?: string | null;
}) {
  const supabase = createClient();
  const [shifts, setShifts] = useState(initialShifts ?? []);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingShiftFor, setEditingShiftFor] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [historyByEmployee, setHistoryByEmployee] = useState<
    Record<string, LogRow[]>
  >({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);

  const totalOpenDays = openDaysElapsedThisMonth();

  useEffect(() => {
    (async () => {
      setLoadingSummary(true);
      const { data } = await supabase.rpc("admin_staff_attendance_summary");
      const map: Record<string, Summary> = {};
      ((data as Summary[]) ?? []).forEach((row) => {
        map[row.employee_id] = row;
      });
      setSummaries(map);
      setLoadingSummary(false);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!activeEmployeeId) return;
    setExpandedId(activeEmployeeId);
    setEditingShiftFor(null);
    if (!historyByEmployee[activeEmployeeId]) {
      void loadHistory(activeEmployeeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmployeeId]);

  const shiftFor = (employeeId: string) =>
    shifts.find((s) => s.employee_id === employeeId) ?? null;

  const loadHistory = useCallback(
    async (employeeId: string) => {
      setHistoryLoadingId(employeeId);
      const { data } = await supabase
        .from("attendance_logs")
        .select("id, punch_in, punch_out")
        .eq("employee_id", employeeId)
        .order("punch_in", { ascending: false })
        .limit(200);
      setHistoryLoadingId(null);
      setHistoryByEmployee((prev) => ({
        ...prev,
        [employeeId]: (data as LogRow[]) ?? [],
      }));
    },
    [supabase],
  );

  const toggleExpand = (employeeId: string) => {
    if (expandedId === employeeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(employeeId);
    setEditingShiftFor(null);
    if (!historyByEmployee[employeeId]) void loadHistory(employeeId);
  };

  const handleReset = async (id: string, name: string) => {
    if (!confirm(`Reset ${name}'s password?`)) return;
    setResettingId(id);
    const result = await resetEmployeePassword(id);
    setResettingId(null);
    if (result.error) return alert(result.error);
    alert(`New temporary password for ${name}: ${result.newTemporaryPassword}`);
  };

  return (
    <div className="space-y-3">
      {staff.map((s) => {
        const summary = summaries[s.id];
        const shift = shiftFor(s.id);
        const isOpen = expandedId === s.id;
        return (
          <div
            key={s.id}
            className="bg-brand-nightSurface rounded-2xl border border-white/10 overflow-hidden"
          >
            <button
              onClick={() => toggleExpand(s.id)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-brand-nightText">{s.name}</p>
                <p className="text-xs text-brand-nightText/40 capitalize mt-0.5">
                  {s.role}
                  {shift &&
                    ` · ${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                {shift ? (
                  <>
                    <p className="text-sm font-medium text-brand-nightText">
                      {loadingSummary
                        ? "…"
                        : `${summary?.actual_working_days ?? 0}/${totalOpenDays} days`}
                    </p>
                    <p className="text-xs text-brand-nightText/35">
                      this month
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-brand-nightText/35 italic">
                    No shift assigned
                  </p>
                )}
              </div>
              <ChevronDown
                size={16}
                className={`text-brand-nightText/25 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isOpen && (
              <div className="px-5 pb-5 pt-1 border-t border-white/8 space-y-4">
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-xl border border-white/10 bg-brand-nightSurface2/60 px-3 py-3">
                    <p className="text-[11px] text-brand-nightText/40">Hours</p>
                    <p className="mt-1 text-lg font-bold text-brand-nightText">
                      {summary?.total_hours_this_month ?? 0}
                    </p>
                    <p className="text-[11px] text-brand-nightText/35">
                      this month
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-brand-nightSurface2/60 px-3 py-3">
                    <p className="text-[11px] text-brand-nightText/40">
                      Present days
                    </p>
                    <p className="mt-1 text-lg font-bold text-brand-nightText">
                      {summary?.actual_working_days ?? 0}
                    </p>
                    <p className="text-[11px] text-brand-nightText/35">
                      days worked
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-brand-nightSurface2/60 px-3 py-3">
                    <p className="text-[11px] text-brand-nightText/40">
                      Working days
                    </p>
                    <p className="mt-1 text-lg font-bold text-brand-nightText">
                      {totalOpenDays}
                    </p>
                    <p className="text-[11px] text-brand-nightText/35">
                      open this month
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <Clock size={16} className="text-brand-sky" />
                  <p className="text-sm text-brand-nightText">
                    <span className="text-lg font-bold text-brand-nightText">
                      {summary?.total_hours_this_month ?? 0}
                    </span>{" "}
                    <span className="text-brand-nightText/50">
                      hours worked this month
                    </span>
                  </p>
                </div>

                {historyLoadingId === s.id ? (
                  <p className="text-sm text-brand-nightText/40">
                    Loading calendar…
                  </p>
                ) : (
                  <EmployeeCalendar logs={historyByEmployee[s.id] ?? []} />
                )}

                {isAdmin && (
                  <>
                    {editingShiftFor === s.id ? (
                      <ShiftEditor
                        employeeId={s.id}
                        currentShift={shift}
                        onClose={() => setEditingShiftFor(null)}
                        onSaved={(saved) => {
                          setShifts((prev) => {
                            const without = prev.filter(
                              (sh) => sh.employee_id !== s.id,
                            );
                            return [...without, saved];
                          });
                          setEditingShiftFor(null);
                        }}
                      />
                    ) : (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() => setEditingShiftFor(s.id)}
                          className="min-h-[38px] px-4 rounded-lg border border-white/15 text-brand-nightText text-sm font-medium hover:border-brand-sky/40 transition-colors"
                        >
                          Change shift
                        </button>
                        <button
                          onClick={() => handleReset(s.id, s.name)}
                          disabled={resettingId === s.id}
                          className="min-h-[38px] px-4 rounded-lg border border-white/15 text-brand-nightText text-sm font-medium hover:border-brand-coral/40 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                        >
                          <KeyRound size={14} />
                          {resettingId === s.id
                            ? "Resetting…"
                            : "Reset password"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {isAdmin && (
        <button
          onClick={() => setAddModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 min-h-[52px] rounded-2xl border border-dashed border-white/15 text-brand-nightText/50 text-sm font-semibold hover:border-brand-sky/40 hover:text-brand-skyLight transition-colors"
        >
          <Plus size={16} />
          Add employee
        </button>
      )}

      {addModalOpen && (
        <AddEmployeeModal onClose={() => setAddModalOpen(false)} />
      )}
    </div>
  );
}
