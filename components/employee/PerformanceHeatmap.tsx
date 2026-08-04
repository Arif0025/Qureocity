"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { istDateKey, istDateParts, dateKey } from "@/lib/formatTime";

const CLOSED_WEEKDAY = 2; // Tuesday
const WEEKS_SHOWN = 12;
const WEEKDAY_ABBR = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type Summary = {
  actual_working_days: number;
  total_hours_this_month: number;
  working_days_this_month: number;
};
type LogRow = { punch_in: string };
type ShiftRow = { id: string };

// Pure calendar-day math, IST-anchored — same technique as
// EmployeeCalendar.tsx, so this heatmap's "today"/date keys can't drift
// from what the calendar tab and attendance summary show for the same
// data.
function addDaysUTC(
  parts: { year: number; month: number; date: number },
  delta: number,
) {
  const utc = new Date(Date.UTC(parts.year, parts.month, parts.date + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth(),
    date: utc.getUTCDate(),
  };
}
function weekdayOfUTC(parts: { year: number; month: number; date: number }) {
  return new Date(Date.UTC(parts.year, parts.month, parts.date)).getUTCDay();
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
        ((logs as LogRow[]) ?? []).map((l) => istDateKey(l.punch_in)),
      );
      setPresentDays(days);
      setLoading(false);
    })();
  }, [supabase, employeeId]);

  const weeks = useMemo(() => {
    const today = istDateParts(new Date().toISOString());
    const totalDays = WEEKS_SHOWN * 7;
    const todayWeekday = weekdayOfUTC(today);
    const rangeStart = addDaysUTC(today, -(totalDays - 1) - todayWeekday);

    const cells: { date: string; isClosed: boolean; isFuture: boolean }[][] =
      [];
    let week: { date: string; isClosed: boolean; isFuture: boolean }[] = [];
    let cursor = rangeStart;
    const isAfterToday = (p: typeof today) =>
      p.year > today.year ||
      (p.year === today.year && p.month > today.month) ||
      (p.year === today.year && p.month === today.month && p.date > today.date);

    while (!isAfterToday(cursor) || week.length > 0) {
      if (isAfterToday(cursor) && week.length === 0) break;
      const key = dateKey(cursor);
      week.push({
        date: key,
        isClosed: weekdayOfUTC(cursor) === CLOSED_WEEKDAY,
        isFuture: isAfterToday(cursor),
      });
      if (week.length === 7) {
        cells.push(week);
        week = [];
      }
      cursor = addDaysUTC(cursor, 1);
      if (isAfterToday(cursor) && week.length === 0) break;
    }
    if (week.length > 0) {
      while (week.length < 7)
        week.push({ date: "", isClosed: false, isFuture: true });
      cells.push(week);
    }
    return cells;
  }, []);

  // Rules-of-Hooks: this check has to come after every hook call above
  // (useState/useEffect/useMemo), not before — an early return ahead of
  // a hook means that hook silently stops being called the moment
  // hasShift flips to false, which desyncs hook order between renders.
  if (!loading && !hasShift) {
    return (
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-8 text-center text-brand-nightText/40 text-sm">
        No shift assigned yet — check with an admin. Your performance tracking
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
          Attendance — last {WEEKS_SHOWN} weeks
        </p>
        <div className="overflow-x-auto">
          <div className="inline-block">
            {/* Month labels — only shown where a new month starts, same
                convention as GitHub's contribution graph. */}
            <div className="flex gap-[3px] mb-1 pl-[18px]">
              {weeks.map((week, wi) => {
                const firstDay = week.find((d) => d.date);
                const prevFirstDay = weeks[wi - 1]?.find((d) => d.date);
                const month = firstDay ? firstDay.date.slice(5, 7) : null;
                const prevMonth = prevFirstDay
                  ? prevFirstDay.date.slice(5, 7)
                  : null;
                const showLabel = wi === 0 || (month && month !== prevMonth);
                return (
                  <div
                    key={wi}
                    className="w-[14px] text-[9px] text-brand-nightText/35 shrink-0"
                  >
                    {showLabel && firstDay
                      ? MONTH_ABBR[parseInt(firstDay.date.slice(5, 7), 10) - 1]
                      : ""}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-[3px]">
              {/* Weekday labels — weeks are built Sun→Sat top-to-bottom
                  in every column, so one static label column aligns with
                  every row. */}
              <div className="flex flex-col gap-[3px] mr-1">
                {WEEKDAY_ABBR.map((l, i) => (
                  <span
                    key={i}
                    className="w-[14px] h-[14px] flex items-center justify-center text-[9px] text-brand-nightText/35"
                  >
                    {i % 2 === 1 ? l : ""}
                  </span>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day, di) => {
                    if (!day.date)
                      return <div key={di} className="w-[14px] h-[14px]" />;
                    const isPresent = presentDays.has(day.date);
                    // Closed days need to actually read as "closed" — not
                    // blend into the same near-invisible tone used for
                    // future/no-data cells.
                    let tone = "bg-white/8"; // future / no data yet
                    if (day.isClosed) {
                      tone = "bg-brand-sun/30";
                    } else if (!day.isFuture) {
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
        </div>
        <div className="flex items-center gap-3 text-[11px] text-brand-nightText/40 mt-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-leaf" /> Present
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-coral/70" /> Absent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-sun/30" /> Closed
          </span>
        </div>
      </div>
    </div>
  );
}
