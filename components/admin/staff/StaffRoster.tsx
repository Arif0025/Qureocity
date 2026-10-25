"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  KeyRound,
  Plus,
  LogIn,
  LogOut,
  UserMinus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resetEmployeePassword, removeEmployee, setEmployeeSalary } from "@/app/admin/actions";
import { startOfTodayIST } from "@/lib/istTime";
import EmployeeCalendar from "./EmployeeCalendar";
import ShiftEditor from "./ShiftEditor";
import AddEmployeeModal from "../AddEmployeeModal";
import { Clock3 } from "lucide-react";
import NotifyButton from "../home/NotifyButton";
import { expandCollapse } from "@/lib/motion";

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
  paid_leave_hours_this_month?: number;
  paid_leave_days_this_month?: number;
  working_days_this_month: number;
};
type LogRow = {
  id: string;
  punch_in: string;
  punch_out: string | null;
  auto_punched_out?: boolean;
};
type LeaveDay = { date: string; paid: boolean };
type AutoPunchoutRow = {
  employee_id: string;
  employee_name: string;
  punch_in: string;
  punch_out: string;
};
type SalaryType = "monthly" | "hourly";
type SalarySetting = { salary_type: SalaryType | null; salary_rate: number | null };

// An employee is "falling behind" once actual hours drop meaningfully
// under what their shift + days-open-so-far would predict. 80% gives
// some slack for late starts/early leaves without flagging on every
// minor variance.
const BEHIND_SCHEDULE_THRESHOLD = 0.8;

function isBehindSchedule(summary?: Summary): boolean {
  if (!summary || summary.scheduled_hours_this_month == null) return false;
  if (summary.scheduled_hours_this_month <= 0) return false;
  return (
    Number(summary.total_hours_this_month) + Number(summary.paid_leave_hours_this_month || 0) <
    summary.scheduled_hours_this_month * BEHIND_SCHEDULE_THRESHOLD
  );
}

function currency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function salaryEarned(setting: SalarySetting | undefined, summary: Summary | undefined): number | null {
  if (!setting?.salary_type || setting.salary_rate == null || !summary) return null;
  const rate = Number(setting.salary_rate);
  if (!Number.isFinite(rate) || rate < 0) return null;
  const actualHours = Number(summary.total_hours_this_month || 0) + Number(summary.paid_leave_hours_this_month || 0);
  if (setting.salary_type === "hourly") return rate * actualHours;
  const scheduledHours = Number(summary.scheduled_hours_this_month || 0);
  if (scheduledHours > 0) {
    const monthProgress = getMonthProgressRatio();
    const attendanceRatio = actualHours / scheduledHours;
    return rate * monthProgress * Math.min(1, Math.max(0, attendanceRatio));
  }
  return rate * getMonthProgressRatio() * (summary.working_days_this_month > 0
    ? Math.min(1, (Number(summary.actual_working_days || 0) + Number(summary.paid_leave_days_this_month || 0)) / summary.working_days_this_month)
    : 0);
}

function getMonthProgressRatio(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const today = value("day");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let openDays = 0;
  let elapsedOpenDays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 2) continue;
    openDays += 1;
    if (day <= today) elapsedOpenDays += 1;
  }
  return openDays ? elapsedOpenDays / openDays : 0;
}

export default function StaffRoster({
  staff,
  initialShifts,
  initialShiftsLoaded,
  isAdmin,
  activeEmployeeId,
  notifyEmployeeId,
}: {
  staff: Staff[];
  initialShifts: Shift[];
  initialShiftsLoaded: boolean;
  isAdmin: boolean;
  activeEmployeeId?: string | null;
  notifyEmployeeId?: string | null;
}) {
  const [supabase] = useState(() => createClient());
  const [staffList, setStaffList] = useState(staff ?? []);
  const [shifts, setShifts] = useState(initialShifts ?? []);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [salarySettings, setSalarySettings] = useState<Record<string, SalarySetting>>({});
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, { type: SalaryType; rate: string }>>({});
  const [savingSalaryFor, setSavingSalaryFor] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingShiftFor, setEditingShiftFor] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [historyByEmployee, setHistoryByEmployee] = useState<
    Record<string, LogRow[]>
  >({});
  const [leaveDaysByEmployee, setLeaveDaysByEmployee] = useState<Record<string, LeaveDay[]>>({});
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
  const [leaveReminderDays, setLeaveReminderDays] = useState(1);
  const [savedLeaveReminderDays, setSavedLeaveReminderDays] = useState(1);
  const [editingLeaveReminder, setEditingLeaveReminder] = useState(false);
  const [savingLeaveReminder, setSavingLeaveReminder] = useState(false);
  const [leaveReminderNote, setLeaveReminderNote] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    void supabase.rpc("admin_leave_overview").then(({ data, error }) => {
      if (error) setLeaveReminderNote(error.message);
      else {
        const days = (data as { reminder_days?: number } | null)?.reminder_days ?? 1;
        setLeaveReminderDays(days);
        setSavedLeaveReminderDays(days);
      }
    });
  }, [supabase, isAdmin]);

  const saveLeaveReminder = async () => {
    if (!Number.isInteger(leaveReminderDays) || leaveReminderDays < 0 || leaveReminderDays > 60) {
      setLeaveReminderNote("Choose a whole number from 0 to 60.");
      return;
    }
    setSavingLeaveReminder(true);
    setLeaveReminderNote("");
    const { error } = await supabase.rpc("admin_set_leave_reminder_days", { p_days: leaveReminderDays });
    setSavingLeaveReminder(false);
    if (error) setLeaveReminderNote(error.message);
    else {
      setSavedLeaveReminderDays(leaveReminderDays);
      setEditingLeaveReminder(false);
    }
  };

  useEffect(() => {
    if (initialShiftsLoaded) {
      setShifts(initialShifts ?? []);
      return;
    }
    let active = true;
    void supabase
      .from("shifts")
      .select("id, employee_id, start_time, end_time, notes")
      .order("start_time", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setShifts((data as Shift[]) ?? []);
      });
    return () => { active = false; };
  }, [supabase, initialShifts, initialShiftsLoaded]);

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
    if (!isAdmin) return;
    let active = true;
    void supabase
      .from("employees")
      .select("id, salary_type, salary_rate")
      .then(({ data }) => {
        if (!active) return;
        const settings: Record<string, SalarySetting> = {};
        const drafts: Record<string, { type: SalaryType; rate: string }> = {};
        for (const row of (data ?? []) as { id: string; salary_type: SalaryType | null; salary_rate: number | null }[]) {
          settings[row.id] = { salary_type: row.salary_type, salary_rate: row.salary_rate };
          drafts[row.id] = {
            type: row.salary_type ?? "monthly",
            rate: row.salary_rate == null ? "" : String(row.salary_rate),
          };
        }
        setSalarySettings(settings);
        setSalaryDrafts(drafts);
      });
    return () => { active = false; };
  }, [supabase, isAdmin]);

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
      const [{ data }, { data: leaveRows }] = await Promise.all([supabase
        .from("attendance_logs")
        .select("id, punch_in, punch_out, auto_punched_out")
        .eq("employee_id", employeeId)
        .order("punch_in", { ascending: false })
        .limit(1000), supabase
        .from("employee_leave_requests")
        .select("start_date, end_date, paid_dates")
        .eq("employee_id", employeeId)
        .eq("status", "approved")]);
      const leaveDays: LeaveDay[] = [];
      for (const row of (leaveRows ?? []) as { start_date: string; end_date: string; paid_dates: string[] }[]) {
        const paid = new Set(row.paid_dates ?? []);
        const day = new Date(`${row.start_date}T00:00:00Z`);
        const end = new Date(`${row.end_date}T00:00:00Z`);
        while (day <= end) {
          if (day.getUTCDay() !== 2) {
            const date = day.toISOString().slice(0, 10);
            leaveDays.push({ date, paid: paid.has(date) });
          }
          day.setUTCDate(day.getUTCDate() + 1);
        }
      }
      setHistoryLoadingId(null);
      setHistoryByEmployee((prev) => ({
        ...prev,
        [employeeId]: (data as LogRow[]) ?? [],
      }));
      setLeaveDaysByEmployee((prev) => ({ ...prev, [employeeId]: leaveDays }));
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

  const saveSalary = async (employeeId: string) => {
    const draft = salaryDrafts[employeeId];
    const rate = Number(draft?.rate);
    if (!draft || draft.rate.trim() === "" || !Number.isFinite(rate) || rate < 0) {
      alert("Enter a valid salary rate.");
      return;
    }
    setSavingSalaryFor(employeeId);
    const result = await setEmployeeSalary(employeeId, draft.type, rate);
    setSavingSalaryFor(null);
    if (result.error) {
      alert(result.error);
      return;
    }
    setSalarySettings((current) => ({
      ...current,
      [employeeId]: { salary_type: draft.type, salary_rate: rate },
    }));
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
            <p className="text-xs font-semibold text-brand-nightText">Leave reminder</p>
          </div>
          {editingLeaveReminder ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <input aria-label="Days before staff leave to remind admins" type="number" min={0} max={60} value={leaveReminderDays}
                onChange={(event) => setLeaveReminderDays(Number(event.target.value))}
                className="w-16 min-h-[32px] rounded-lg border border-white/15 bg-brand-nightSurface2 px-2 text-sm text-brand-nightText" />
              <span className="text-xs text-brand-nightText/40">days</span>
              <button type="button" disabled={savingLeaveReminder || leaveReminderDays < 0 || leaveReminderDays > 60}
                onClick={() => void saveLeaveReminder()}
                className="px-2 text-xs font-semibold text-brand-sky disabled:opacity-50">
                {savingLeaveReminder ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => { setLeaveReminderDays(savedLeaveReminderDays); setLeaveReminderNote(""); setEditingLeaveReminder(true); }}
              className="shrink-0 text-sm font-semibold text-brand-nightText">
              {savedLeaveReminderDays} {savedLeaveReminderDays === 1 ? "day" : "days"}
            </button>
          )}
        </div>
      )}
      {isAdmin && leaveReminderNote && <p role="alert" className="text-xs text-brand-coral">{leaveReminderNote}</p>}
      {isAdmin && (
        <div className="bg-brand-nightSurface rounded-xl border border-white/10 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand-nightText">
              Overtime / undertime threshold
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
          </div>
          {editingAutoPunchOutTime ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="time"
                value={autoPunchOutTimeInput}
                onChange={(e) => setAutoPunchOutTimeInput(e.target.value)}
                className="min-h-[32px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-2"
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
              <div className="flex shrink-0 items-center gap-2.5 sm:gap-4">
                {shift ? (
                  <div className="min-w-[48px] text-right" title={`${summary?.actual_working_days ?? 0} present days out of ${summary?.working_days_this_month ?? 0} total days this month`}>
                    <p className="text-[13px] font-semibold tabular-nums text-brand-nightText sm:text-sm">
                      {loadingSummary
                        ? "…"
                        : `${summary?.actual_working_days ?? 0}/${summary?.working_days_this_month ?? 0}`}
                    </p>
                    <p className="flex items-center justify-end gap-1 text-[9px] leading-tight text-brand-nightText/45 sm:text-[10px]">
                      {behind && <span aria-label="Below expected hours" title="Below expected hours" className="h-2 w-2 rounded-full bg-brand-sun ring-2 ring-brand-sun/20" />}
                      present days
                    </p>
                  </div>
                ) : (
                  <p className="max-w-[78px] text-right text-[10px] text-brand-nightText/35 italic">
                    No shift assigned
                  </p>
                )}
                {isAdmin && salaryEarned(salarySettings[s.id], summary) != null && (
                  <div className="min-w-0 text-right">
                    <p className="text-[13px] font-bold tabular-nums text-brand-skyLight sm:text-sm">
                      {currency(salaryEarned(salarySettings[s.id], summary) ?? 0)}
                    </p>
                    <p className="text-[9px] leading-tight text-brand-nightText/40 sm:text-[10px]">payable to date</p>
                  </div>
                )}
              </div>
              <ChevronDown
                size={16}
                className={`text-brand-nightText/25 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div {...expandCollapse} className="overflow-hidden">
              <div className="px-5 pb-5 pt-1 border-t border-white/8 space-y-4">
                {isAdmin && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-brand-nightSurface2/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-brand-nightText">Salary</p>
                      {salaryEarned(salarySettings[s.id], summary) != null && (
                        <p className="text-sm font-bold tabular-nums text-brand-skyLight">
                          {currency(salaryEarned(salarySettings[s.id], summary) ?? 0)} payable so far
                        </p>
                      )}
                    </div>
                    {Number(summary?.paid_leave_hours_this_month || 0) > 0 && (
                      <p className="mb-2 text-[10px] text-brand-nightText/40">
                        Includes {Number(summary?.paid_leave_hours_this_month || 0)} paid leave hours
                        {Number(summary?.paid_leave_days_this_month || 0) > 0
                          ? ` across ${Number(summary?.paid_leave_days_this_month)} paid day${Number(summary?.paid_leave_days_this_month) === 1 ? "" : "s"}`
                          : ""}.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`${s.name} salary calculation`}
                        value={salaryDrafts[s.id]?.type ?? "monthly"}
                        onChange={(event) => setSalaryDrafts((current) => ({
                          ...current,
                          [s.id]: { type: event.target.value as SalaryType, rate: current[s.id]?.rate ?? "" },
                        }))}
                        className="min-h-10 rounded-lg border border-white/15 bg-brand-nightSurface px-2.5 text-sm text-brand-nightText"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="hourly">Hourly</option>
                      </select>
                      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/15 bg-brand-nightSurface px-3">
                        <span className="shrink-0 text-xs text-brand-nightText/50">₹</span>
                        <input
                          aria-label={`${s.name} ${salaryDrafts[s.id]?.type === "hourly" ? "hourly rate" : "monthly salary"}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={salaryDrafts[s.id]?.rate ?? ""}
                          onChange={(event) => setSalaryDrafts((current) => ({
                            ...current,
                            [s.id]: { type: current[s.id]?.type ?? "monthly", rate: event.target.value },
                          }))}
                          placeholder={salaryDrafts[s.id]?.type === "hourly" ? "Per hour" : "Per month"}
                          className="min-h-10 w-full min-w-0 bg-transparent text-sm text-brand-nightText outline-none placeholder:text-brand-nightText/30"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={savingSalaryFor === s.id}
                        onClick={() => void saveSalary(s.id)}
                        className="min-h-10 rounded-lg bg-brand-sky px-3 text-xs font-semibold text-brand-ink disabled:opacity-50"
                      >
                        {savingSalaryFor === s.id ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
                {isAdmin && <div className="flex justify-end"><NotifyButton employeeId={s.id} employeeName={s.name} initialOpen={notifyEmployeeId === s.id} /></div>}
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
                    leaveDays={leaveDaysByEmployee[s.id] ?? []}
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
              </motion.div>
            )}
            </AnimatePresence>
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
