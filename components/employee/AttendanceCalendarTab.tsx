"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import EmployeeCalendar from "@/components/admin/staff/EmployeeCalendar";

type Summary = {
  actual_working_days: number;
  total_hours_this_month: number;
  working_days_this_month: number;
};
type LogRow = { id: string; punch_in: string; punch_out: string | null };
type ShiftRow = { start_time: string; end_time: string } | null;

export default function AttendanceCalendarTab({
  employeeId,
}: {
  employeeId: string;
}) {
  const supabase = createClient();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [shift, setShift] = useState<ShiftRow>(null);
  const [varianceThreshold, setVarianceThreshold] = useState(30);
  const [hasShift, setHasShift] = useState<boolean | null>(null); // null = still checking
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [
        { data: summaryData },
        { data: logRows },
        { data: shiftRow },
        { data: settings },
      ] = await Promise.all([
        supabase.rpc("admin_staff_attendance_summary", {
          p_employee_id: employeeId,
        }),
        supabase
          .from("attendance_logs")
          .select("id, punch_in, punch_out")
          .eq("employee_id", employeeId)
          .order("punch_in", { ascending: false })
          .limit(400),
        supabase
          .from("shifts")
          .select("start_time, end_time")
          .eq("employee_id", employeeId)
          .maybeSingle(),
        supabase
          .from("app_settings")
          .select("attendance_variance_threshold_mins")
          .eq("id", true)
          .single(),
      ]);
      setSummary(((summaryData as Summary[]) ?? [])[0] ?? null);
      setHasShift(!!(shiftRow as ShiftRow));
      setShift((shiftRow as ShiftRow) ?? null);
      setLogs((logRows as LogRow[]) ?? []);
      if (settings?.attendance_variance_threshold_mins != null) {
        setVarianceThreshold(settings.attendance_variance_threshold_mins);
      }
      setLoading(false);
    })();
  }, [supabase, employeeId]);

  if (!loading && !hasShift) {
    return (
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-8 text-center text-brand-nightText/40 text-sm">
        No shift assigned yet — check with an admin. Your attendance tracking
        starts once a shift is set.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-brand-nightSurface rounded-xl2 border border-white/10 px-3 py-3 text-center">
          <p className="text-2xl font-extrabold text-brand-nightText">
            {loading ? "—" : (summary?.actual_working_days ?? 0)}
          </p>
          <p className="text-[11px] text-brand-nightText/40 mt-0.5">
            of {loading ? "—" : (summary?.working_days_this_month ?? 0)} days
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
