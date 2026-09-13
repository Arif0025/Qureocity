"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  KeyRound,
  Plus,
  LogIn,
  LogOut,
  UserMinus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resetEmployeePassword, removeEmployee } from "@/app/admin/actions";
import { startOfTodayIST } from "@/lib/istTime";
import EmployeeCalendar from "./EmployeeCalendar";
import ShiftEditor from "./ShiftEditor";
import AddEmployeeModal from "../AddEmployeeModal";
import { Clock3 } from "lucide-react";

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
  scheduled_hours_this_month: number | null;
  working_days_this_month: number;
};
type LogRow = {
  id: string;
  punch_in: string;
  punch_out: string | null;
  auto_punched_out?: boolean;
};
type AutoPunchoutRow = {
  employee_id: string;
  employee_name: string;
  punch_in: string;
  punch_out: string;
};

// An employee is "falling behind" once actual hours drop meaningfully
// under what their shift + days-open-so-far would predict. 80% gives
// some slack for late starts/early leaves without flagging on every
// minor variance.
const BEHIND_SCHEDULE_THRESHOLD = 0.8;

function isBehindSchedule(summary?: Summary): boolean {
  if (!summary || summary.scheduled_hours_this_month == null) return false;
  if (summary.scheduled_hours_this_month <= 0) return false;
  return (
    summary.total_hours_this_month <
    summary.scheduled_hours_this_month * BEHIND_SCHEDULE_THRESHOLD
  );
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
  const [supabase] = useState(() => createClient());
  const [staffList, setStaffList] = useState(staff ?? []);
  const [shifts, setShifts] = useState(initialShifts ?? []);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingShiftFor, setEditingShiftFor] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [historyByEmployee, setHistoryByEmployee] = useState<
    Record<string, LogRow[]>
  >({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [varianceThreshold, setVarianceThreshold] = useState(30);
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState("30");
  const [autoPunchOutTime, setAutoPunchOutTime] = useState("21:30");
  const [editingAutoPunchOutTime, setEditingAutoPunchOutTime] = useState(false);
  const [autoPunchOutTimeInput, setAutoPunchOutTimeInput] = useState("21:30");
  const [autoPunchedToday, setAutoPunchedToday] = useState<AutoPunchoutRow[]>(
    [],
  );
  const [onDutyIds, setOnDutyIds] = useState<Set<string>>(new Set());
  const [confirmingPunchOutId, setConfirmingPunchOutId] = useState<
    string | null
  >(null);
  const [punchingOutId, setPunchingOutId] = useState<string | null>(null);
  const [confirmingPunchInId, setConfirmingPunchInId] = useState<string | null>(
    null,
  );
  const [punchingInId, setPunchingInId] = useState<string | null>(null);

  const refetchOnDuty = useCallback(async () => {
    const { data } = await supabase
      .from("attendance_logs")
      .select("employee_id")
      .is("punch_out", null);
    setOnDutyIds(
      new Set(
        ((data as { employee_id: string }[]) ?? []).map((r) => r.employee_id),
      ),
    );
  }, [supabase]);

  const refetchAutoPunchedToday = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase
      .from("attendance_logs")
      .select("employee_id, punch_in, punch_out, employees(name)")
      .eq("auto_punched_out", true)
      .gte("punch_out", startOfTodayIST().toISOString())
      .order("punch_out", { ascending: false });
    setAutoPunchedToday(
      ((data as any[]) ?? []).map((row) => ({
        employee_id: row.employee_id,
        employee_name: row.employees?.name ?? "Unknown",
        punch_in: row.punch_in,
        punch_out: row.punch_out,
      })),
    );
  }, [supabase, isAdmin]);

  useEffect(() => {
    void refetchOnDuty();
    const channel = supabase
      .channel("attendance_logs_roster")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_logs" },
        () => {
          void refetchOnDuty();
          void refetchAutoPunchedToday();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refetchOnDuty, refetchAutoPunchedToday]);

  const handleForcePunchOut = async (employeeId: string) => {
    setPunchingOutId(employeeId);
    setConfirmingPunchOutId(null);
    const { error } = await supabase.rpc("admin_force_punch_out", {
      p_employee_id: employeeId,
    });
    setPunchingOutId(null);
    if (error) alert(error.message);
    await Promise.all([
      refetchOnDuty(),
      refreshSummaries(),
      loadHistory(employeeId),
    ]);
  };

  const handleForcePunchIn = async (employeeId: string) => {
    setPunchingInId(employeeId);
    setConfirmingPunchInId(null);
    const { data, error } = await supabase.rpc("admin_force_punch_in", {
      p_employee_id: employeeId,
    });
    setPunchingInId(null);
    if (error) {
      alert(error.message);
    } else if (data && !data.success && data.reason !== "already_on_duty") {
      alert("Could not punch in this employee.");
    }
    await Promise.all([
      refetchOnDuty(),
      refreshSummaries(),
      loadHistory(employeeId),
    ]);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("attendance_variance_threshold_mins, auto_punch_out_time")
        .eq("id", true)
        .single();
      if (data?.attendance_variance_threshold_mins != null) {
        setVarianceThreshold(data.attendance_variance_threshold_mins);
        setThresholdInput(String(data.attendance_variance_threshold_mins));
      }
      if (data?.auto_punch_out_time) {
        // Postgres `time` comes back as "HH:MM:SS" — trim to "HH:MM" for
        // the <input type="time"> control.
        const trimmed = String(data.auto_punch_out_time).slice(0, 5);
        setAutoPunchOutTime(trimmed);
        setAutoPunchOutTimeInput(trimmed);
      }
    })();
  }, [supabase]);

  const saveThreshold = async () => {
    const mins = parseInt(thresholdInput, 10);
    if (!Number.isFinite(mins) || mins < 0) return;
    const { error } = await supabase
      .from("app_settings")
      .update({ attendance_variance_threshold_mins: mins })
      .eq("id", true);
    if (!error) {
      setVarianceThreshold(mins);
      setEditingThreshold(false);
    }
  };

  const saveAutoPunchOutTime = async () => {
    if (!/^\d{2}:\d{2}$/.test(autoPunchOutTimeInput)) return;
    const { error } = await supabase
      .from("app_settings")
      .update({ auto_punch_out_time: autoPunchOutTimeInput })
      .eq("id", true);
    if (!error) {
      setAutoPunchOutTime(autoPunchOutTimeInput);
      setEditingAutoPunchOutTime(false);
    }
  };

  useEffect(() => {
    void refetchAutoPunchedToday();
  }, [refetchAutoPunchedToday]);

  const refreshSummaries = useCallback(async () => {
    setLoadingSummary(true);
    const { data } = await supabase.rpc("admin_staff_attendance_summary");
    const map: Record<string, Summary> = {};
    ((data as Summary[]) ?? []).forEach((row) => {
      map[row.employee_id] = row;
    });
    setSummaries(map);
    setLoadingSummary(false);
  }, [supabase]);

  useEffect(() => {
    setStaffList(staff ?? []);
  }, [staff]);

  useEffect(() => {
    void refreshSummaries();
  }, [refreshSummaries]);

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
        .select("id, punch_in, punch_out, auto_punched_out")
        .eq("employee_id", employeeId)
        .order("punch_in", { ascending: false })
        .limit(1000);
      setHistoryLoadingId(null);
      setHistoryByEmployee((prev) => ({
        ...prev,
        [employeeId]: (data as LogRow[]) ?? [],
      }));
    },
    [supabase],
  );

  const handleSaveAttendance = async (
    employeeId: string,
    input: { logId: string | null; punchIn: string; punchOut: string | null },
  ): Promise<string | null> => {
    const { error } = await supabase.rpc("admin_save_attendance_log", {
      p_employee_id: employeeId,
      p_log_id: input.logId,
      p_punch_in: input.punchIn,
      p_punch_out: input.punchOut,
    });
    if (error) return error.message;
    await Promise.all([
      loadHistory(employeeId),
      refreshSummaries(),
      refetchOnDuty(),
    ]);
    return null;
  };

  const handleDeleteAttendance = async (
    employeeId: string,
    logId: string,
  ): Promise<string | null> => {
    const { data, error } = await supabase.rpc("admin_delete_attendance_log", {
      p_employee_id: employeeId,
      p_log_id: logId,
    });
    if (error) return error.message;
    if (data && !data.success) return "Attendance record was not found.";
    await Promise.all([
      loadHistory(employeeId),
      refreshSummaries(),
      refetchOnDuty(),
    ]);
    return null;
  };

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

  const handleRemove = async (id: string, name: string) => {
    if (
      !confirm(
        `Remove ${name} from the team? This will delete their login and account permissions.`,
      )
    )
      return;
    setRemovingId(id);
    const result = await removeEmployee(id);
    setRemovingId(null);
    if (result.error) return alert(result.error);
    setStaffList((prev) => prev.filter((employee) => employee.id !== id));
    setExpandedId((current) => (current === id ? null : current));
    setEditingShiftFor((current) => (current === id ? null : current));
    alert(`${name} was removed successfully.`);
  };

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="bg-brand-nightSurface rounded-xl border border-white/10 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand-nightText">
              Overtime / undertime threshold
            </p>
            <p className="text-[11px] text-brand-nightText/40">
              How far off a shift counts as over/under, on the calendars below
              and the roster's behind-schedule flag.
            </p>
          </div>
          {editingThreshold ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min={0}
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="w-16 min-h-[32px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-2"
              />
              <span className="text-xs text-brand-nightText/40">min</span>
              <button
                onClick={saveThreshold}
                className="text-xs font-semibold text-brand-sky px-2"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingThreshold(true)}
              className="text-sm font-semibold text-brand-nightText shrink-0"
            >
              {varianceThreshold} min
            </button>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="bg-brand-nightSurface rounded-xl border border-white/10 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand-nightText">
              Auto punch-out time
            </p>
            <p className="text-[11px] text-brand-nightText/40">
              Anyone still punched in past this time gets automatically clocked
              out. Since this runs on the once-a-day cron (~9:30 PM IST), a time
              set later than that won't take effect until the next day's run.
            </p>
          </div>
          {editingAutoPunchOutTime ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="time"
                value={autoPunchOutTimeInput}
                onChange={(e) => setAutoPunchOutTimeInput(e.target.value)}
                className="min-h-[32px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-2 [color-scheme:dark]"
              />
              <button
                onClick={saveAutoPunchOutTime}
                className="text-xs font-semibold text-brand-sky px-2"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingAutoPunchOutTime(true)}
              className="text-sm font-semibold text-brand-nightText shrink-0"
            >
              {autoPunchOutTime}
            </button>
          )}
        </div>
      )}

      {isAdmin && autoPunchedToday.length > 0 && (
        <div className="rounded-xl border border-brand-sky/25 bg-brand-sky/8 px-4 py-3 flex items-start gap-2.5">
          <Clock3 size={15} className="text-brand-sky shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-brand-nightText">
              {autoPunchedToday.length === 1
                ? `${autoPunchedToday[0].employee_name} was auto clocked out today`
                : `${autoPunchedToday.length} staff were auto clocked out today`}
            </p>
            <p className="text-[11px] text-brand-nightText/45 mt-0.5">
              {autoPunchedToday
                .map(
                  (row) =>
                    `${row.employee_name} at ${new Date(row.punch_out).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`,
                )
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      {staffList.map((s) => {
        const summary = summaries[s.id];
        const shift = shiftFor(s.id);
        const isOpen = expandedId === s.id;
        const behind = isBehindSchedule(summary);
        return (
          <div
            key={s.id}
            className={`bg-brand-nightSurface rounded-2xl border overflow-hidden ${
              behind
                ? "border-white/[0.1] border-l-4 border-l-brand-sun"
                : "border-white/10"
            }`}
          >
            <button
              onClick={() => toggleExpand(s.id)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-1.5 font-semibold text-brand-nightText">
                  {s.name}
                  {onDutyIds.has(s.id) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-leaf shrink-0" />
                  )}
                </p>
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
                        : `${summary?.actual_working_days ?? 0}/${summary?.working_days_this_month ?? 0} days`}
                    </p>
                    <p
                      className={`text-xs ${behind ? "text-brand-sun" : "text-brand-nightText/35"}`}
                    >
                      {behind ? "Falling behind" : "this month"}
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
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-xl border border-white/10 bg-brand-nightSurface2/60 px-3 py-3">
                    <p className="text-[11px] text-brand-nightText/40">
                      Actual hours
                    </p>
                    <p className="mt-1 text-lg font-bold text-brand-nightText">
                      {summary?.total_hours_this_month ?? 0}
                    </p>
                    <p className="text-[11px] text-brand-nightText/35">
                      this month
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-brand-nightSurface2/60 px-3 py-3">
                    <p className="text-[11px] text-brand-nightText/40">
                      Scheduled hours
                    </p>
                    <p className="mt-1 text-lg font-bold text-brand-nightText">
                      {summary?.scheduled_hours_this_month ?? "—"}
                    </p>
                    <p className="text-[11px] text-brand-nightText/35">
                      based on shift
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
                      {summary?.working_days_this_month ?? 0}
                    </p>
                    <p className="text-[11px] text-brand-nightText/35">
                      open this month
                    </p>
                  </div>
                </div>

                <div
                  className={`rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 border ${
                    onDutyIds.has(s.id)
                      ? "border-brand-leaf/30 bg-brand-leaf/8"
                      : "border-white/10 bg-brand-nightSurface2/60"
                  }`}
                >
                  <p className="text-xs text-brand-nightText/60">
                    {onDutyIds.has(s.id)
                      ? "Currently punched in"
                      : "Not punched in"}
                  </p>
                  {onDutyIds.has(s.id) ? (
                    confirmingPunchOutId === s.id ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleForcePunchOut(s.id)}
                          disabled={punchingOutId === s.id}
                          className="min-h-[30px] px-3 rounded-lg bg-brand-coral text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {punchingOutId === s.id ? "Punching out…" : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmingPunchOutId(null)}
                          className="text-xs text-brand-nightText/40"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingPunchOutId(s.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-brand-nightText/60 hover:text-brand-coral border border-white/15 hover:border-brand-coral/40 rounded-lg px-2.5 py-1.5 shrink-0 transition-colors"
                      >
                        <LogOut size={12} />
                        Punch out
                      </button>
                    )
                  ) : confirmingPunchInId === s.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleForcePunchIn(s.id)}
                        disabled={punchingInId === s.id}
                        className="min-h-[30px] px-3 rounded-lg bg-brand-leaf text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {punchingInId === s.id ? "Punching in…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmingPunchInId(null)}
                        className="text-xs text-brand-nightText/40"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingPunchInId(s.id)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-brand-nightText/60 hover:text-brand-leaf border border-white/15 hover:border-brand-leaf/40 rounded-lg px-2.5 py-1.5 shrink-0 transition-colors"
                    >
                      <LogIn size={12} />
                      Punch in
                    </button>
                  )}
                </div>

                {historyLoadingId === s.id ? (
                  <p className="text-sm text-brand-nightText/40">
                    Loading calendar…
                  </p>
                ) : (
                  <EmployeeCalendar
                    logs={historyByEmployee[s.id] ?? []}
                    shift={shift}
                    varianceThresholdMins={varianceThreshold}
                    showLegend
                    editable={isAdmin}
                    onSaveAttendance={(input) =>
                      handleSaveAttendance(s.id, input)
                    }
                    onDeleteAttendance={(logId) =>
                      handleDeleteAttendance(s.id, logId)
                    }
                  />
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
                        <button
                          onClick={() => handleRemove(s.id, s.name)}
                          disabled={removingId === s.id}
                          className="min-h-[38px] px-4 rounded-lg border border-white/15 text-brand-nightText text-sm font-medium hover:border-brand-coral/40 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                        >
                          <UserMinus size={14} />
                          {removingId === s.id
                            ? "Removing…"
                            : "Remove employee"}
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
