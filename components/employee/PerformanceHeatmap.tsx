"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

const CLOSED_WEEKDAY = 2; // Tuesday
const WEEKS_SHOWN = 12;

type Summary = {
  actual_working_days: number;
  total_hours_this_month: number;
};
type LogRow = { punch_in: string };
type ShiftRow = { id: string };

function openDaysElapsedThisMonth(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  let count = 0;
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== CLOSED_WEEKDAY) count++;
  }
  return count;
}

export default function PerformanceHeatmap({
  employeeId,
}: {
  employeeId: string;
}) {
  const supabase = createClient();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [presentDays, setPresentDays] = useState<Set<string>>(new Set());
  const [hasShift, setHasShift] = useState<boolean | null>(null); // null = still checking
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: summaryData }, { data: logs }, { data: shiftRow }] =
        await Promise.all([
          supabase.rpc("admin_staff_attendance_summary", {
            p_employee_id: employeeId,
          }),
          supabase
            .from("attendance_logs")
            .select("punch_in")
            .eq("employee_id", employeeId)
            .order("punch_in", { ascending: false })
            .limit(400),
          supabase
            .from("shifts")
            .select("id")
            .eq("employee_id", employeeId)
            .maybeSingle(),
        ]);
      const row = ((summaryData as Summary[]) ?? [])[0] ?? null;
      setSummary(row);
      setHasShift(!!(shiftRow as ShiftRow | null));
      const days = new Set(
        ((logs as LogRow[]) ?? []).map((l) =>
          new Date(l.punch_in).toISOString().slice(0, 10),
        ),
      );
      setPresentDays(days);
      setLoading(false);
    })();
  }, [supabase, employeeId]);

  const totalOpenDays = openDaysElapsedThisMonth();

  if (!loading && !hasShift) {
    return (
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-8 text-center text-brand-nightText/40 text-sm">
        No shift assigned yet — check with an admin. Your performance tracking
        starts once a shift is set.
      </div>
    );
  }

  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalDays = WEEKS_SHOWN * 7;
    const rangeStart = new Date(today);
    rangeStart.setDate(rangeStart.getDate() - (totalDays - 1) - today.getDay());

    const cells: { date: string; isClosed: boolean; isFuture: boolean }[][] =
      [];
    let week: { date: string; isClosed: boolean; isFuture: boolean }[] = [];
    const cursor = new Date(rangeStart);
    while (cursor <= today || week.length > 0) {
      if (cursor > today && week.length === 0) break;
      const key = cursor.toISOString().slice(0, 10);
      week.push({
        date: key,
        isClosed: cursor.getDay() === CLOSED_WEEKDAY,
        isFuture: cursor > today,
      });
      if (week.length === 7) {
        cells.push(week);
        week = [];
      }
      cursor.setDate(cursor.getDate() + 1);
      if (cursor > today && week.length === 0) break;
    }
    if (week.length > 0) {
      while (week.length < 7)
        week.push({ date: "", isClosed: false, isFuture: true });
      cells.push(week);
    }
    return cells;
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-brand-nightSurface rounded-xl2 border border-white/10 px-3 py-3 text-center">
          <p className="text-2xl font-extrabold text-brand-nightText">
            {loading ? "—" : (summary?.actual_working_days ?? 0)}
          </p>
          <p className="text-[11px] text-brand-nightText/40 mt-0.5">
            of {totalOpenDays} days
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
          Attendance — last {WEEKS_SHOWN} weeks
        </p>
        <div className="overflow-x-auto">
          <div className="flex gap-[3px] w-fit">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) => {
                  if (!day.date)
                    return <div key={di} className="w-[14px] h-[14px]" />;
                  const isPresent = presentDays.has(day.date);
                  let tone = "bg-white/8"; // closed / future / no data yet
                  if (!day.isClosed && !day.isFuture) {
                    tone = isPresent ? "bg-brand-leaf" : "bg-brand-coral/70";
                  }
                  return (
                    <div
                      key={di}
                      title={
                        day.isClosed
                          ? `${day.date}: Closed`
                          : day.isFuture
                            ? day.date
                            : `${day.date}: ${isPresent ? "Present" : "Absent"}`
                      }
                      className={`w-[14px] h-[14px] rounded-[3px] ${tone}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-brand-nightText/40 mt-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-leaf" /> Present
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-coral/70" /> Absent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-white/8" /> Closed
          </span>
        </div>
      </div>
    </div>
  );
}
