"use client";

import { useState, useEffect, useMemo } from "react";
import { istDateKey, istDateParts, dateKey } from "@/lib/formatTime";
import { createClient } from "@/lib/supabase/client";
import EmployeeCalendar from "@/components/admin/staff/EmployeeCalendar";

type Summary = {
  actual_working_days: number;
  total_hours_this_month: number;
  working_days_this_month: number;
};
type LogRow = {
  id: string;
  punch_in: string;
  punch_out: string | null;
  auto_punched_out?: boolean;
};
type ShiftRow = { start_time: string; end_time: string; notes?: string | null } | null;

const CLOSED_WEEKDAY = 2;

function addDaysUTC(parts: { year: number; month: number; date: number }, delta: number) {
  const date = new Date(Date.UTC(parts.year, parts.month, parts.date + delta));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), date: date.getUTCDate() };
}

function weekdayOfUTC(parts: { year: number; month: number; date: number }) {
  return new Date(Date.UTC(parts.year, parts.month, parts.date)).getUTCDay();
}

export default function AttendanceCalendarTab({
  employeeId,
  shift,
}: {
  employeeId: string;
  shift: ShiftRow | undefined;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [varianceThreshold, setVarianceThreshold] = useState(30);
  const [loading, setLoading] = useState(true);
  const today = istDateParts(new Date().toISOString());
  const last7 = Array.from({ length: 7 }, (_, index) => addDaysUTC(today, -(6 - index)));
  const presentDays = new Set(logs.map((log) => istDateKey(log.punch_in)));
  const autoPunchedDays = new Set(logs.filter((log) => log.auto_punched_out).map((log) => istDateKey(log.punch_in)));
  const last7Keys = new Set(last7.map(dateKey));
  const autoPunchesLast7 = new Set([...autoPunchedDays].filter((day) => last7Keys.has(day)));
  const leaveDays = Math.max((summary?.working_days_this_month ?? 0) - (summary?.actual_working_days ?? 0), 0);

  useEffect(() => {
    (async () => {
      if (shift === undefined) return;
      if (!shift) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [
        { data: summaryData },
        { data: logRows },
        { data: settings },
      ] = await Promise.all([
        supabase.rpc("admin_staff_attendance_summary", {
          p_employee_id: employeeId,
        }),
        supabase
          .from("attendance_logs")
          .select("id, punch_in, punch_out, auto_punched_out")
          .eq("employee_id", employeeId)
          .order("punch_in", { ascending: false })
          .limit(400),
        supabase
          .from("app_settings")
          .select("attendance_variance_threshold_mins")
          .eq("id", true)
          .single(),
      ]);
      setSummary(((summaryData as Summary[]) ?? [])[0] ?? null);
      setLogs((logRows as LogRow[]) ?? []);
      if (settings?.attendance_variance_threshold_mins != null) {
        setVarianceThreshold(settings.attendance_variance_threshold_mins);
      }
      setLoading(false);
    })();
  }, [supabase, employeeId, shift]);

  if (!loading && shift === null) {
    return (
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-8 text-center text-brand-nightText/40 text-sm">
        No shift assigned yet — check with an admin. Your attendance tracking
        starts once a shift is set.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="bg-brand-nightSurface rounded-xl2 border border-white/10 px-3 py-3 text-center">
          <p className="text-2xl font-extrabold text-brand-nightText">
            {loading ? "—" : (summary?.actual_working_days ?? 0)}
          </p>
          <p className="text-[11px] text-brand-nightText/40 mt-0.5">
            of {loading ? "—" : (summary?.working_days_this_month ?? 0)} workdays
          </p>
        </div>
        <div className="bg-brand-nightSurface rounded-xl2 border border-white/10 px-3 py-3 text-center">
          <p className="text-2xl font-extrabold text-brand-nightText">
            {loading ? "—" : (summary?.total_hours_this_month ?? 0)}
          </p>
          <p className="text-[11px] text-brand-nightText/40 mt-0.5">
            hours this month
          </p>
        </div>
        <div className="bg-brand-nightSurface rounded-xl2 border border-white/10 px-3 py-3 text-center">
          <p className="text-2xl font-extrabold text-brand-nightText">
            {loading || !summary?.actual_working_days
              ? "—"
              : (
                  summary.total_hours_this_month / summary.actual_working_days
                ).toFixed(1)}
          </p>
          <p className="text-[11px] text-brand-nightText/40 mt-0.5">
            avg hrs/day
          </p>
        </div>
        <div className="bg-brand-nightSurface rounded-xl2 border border-white/10 px-3 py-3 text-center">
          <p className="text-2xl font-extrabold text-brand-nightText">
            {loading ? "—" : leaveDays}
          </p>
          <p className="text-[11px] text-brand-nightText/40 mt-0.5">leave days</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-brand-nightSurface px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-brand-nightText/70">Last 7 days</p>
          {autoPunchesLast7.size > 0 && <p className="text-[10px] text-brand-skyLight">{autoPunchesLast7.size} auto punch-out{autoPunchesLast7.size === 1 ? "" : "s"}</p>}
        </div>
        <div className="flex gap-1.5">
          {last7.map((day) => {
            const key = dateKey(day);
            const closed = weekdayOfUTC(day) === CLOSED_WEEKDAY;
            const present = presentDays.has(key);
            const autoPunched = autoPunchedDays.has(key);
            const tone = closed ? "bg-white/10" : present ? "bg-brand-leaf" : "bg-brand-coral/70";
            return <span key={key} title={`${key}${autoPunched ? " · auto punch-out" : ""}`} className={`relative h-2.5 flex-1 rounded-full ${tone}`} />;
          })}
        </div>
      </div>

      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-4">
        <p className="text-sm font-semibold text-brand-nightText mb-3">
          Attendance calendar
        </p>
        {loading ? (
          <p className="text-sm text-brand-nightText/35 text-center py-8">
            Loading…
          </p>
        ) : (
          <EmployeeCalendar
            logs={logs}
            shift={shift}
            varianceThresholdMins={varianceThreshold}
            showLegend
          />
        )}
      </div>
    </div>
  );
}
