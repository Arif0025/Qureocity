"use client";

import { useState, useEffect } from "react";
import { CalendarCheck2, CalendarX2, CalendarRange } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { istDateKey, istDateParts, dateKey } from "@/lib/formatTime";

const CLOSED_WEEKDAY = 2; // Tuesday

type Summary = {
  actual_working_days: number;
  working_days_this_month: number;
};

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

function StatBlock({
  icon: Icon,
  tone,
  value,
  label,
  loading,
}: {
  icon: typeof CalendarCheck2;
  tone: "sky" | "coral" | "leaf";
  value: number;
  label: string;
  loading: boolean;
}) {
  const toneClasses = {
    sky: "bg-brand-sky/15 text-brand-skyLight",
    coral: "bg-brand-coral/15 text-brand-coral",
    leaf: "bg-brand-leaf/15 text-brand-leaf",
  }[tone];

  return (
    <div className="flex-1 min-w-0 rounded-xl2 bg-brand-nightSurface2 border border-white/8 px-3 py-3 flex flex-col items-center text-center gap-1.5">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${toneClasses}`}
      >
        <Icon size={15} strokeWidth={2.25} />
      </div>
      <p className="text-xl font-extrabold text-brand-nightText leading-none tabular-nums">
        {loading ? "—" : value}
      </p>
      <p className="text-[11px] font-medium text-brand-nightText/45 leading-tight">
        {label}
      </p>
    </div>
  );
}

export default function AttendanceSummaryCard({
  employeeId,
}: {
  employeeId: string;
}) {
  const supabase = createClient();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [presentDays, setPresentDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = istDateParts(new Date().toISOString());
      const weekAgo = addDaysUTC(today, -6);
      const [{ data: summaryData }, { data: logs }] = await Promise.all([
        supabase.rpc("admin_staff_attendance_summary", {
          p_employee_id: employeeId,
        }),
        supabase
          .from("attendance_logs")
          .select("punch_in")
          .eq("employee_id", employeeId)
          .gte(
            "punch_in",
            new Date(
              Date.UTC(weekAgo.year, weekAgo.month, weekAgo.date),
            ).toISOString(),
          )
          .order("punch_in", { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;
      setSummary(((summaryData as Summary[]) ?? [])[0] ?? null);
      setPresentDays(
        new Set(
          ((logs as { punch_in: string }[]) ?? []).map((l) =>
            istDateKey(l.punch_in),
          ),
        ),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, employeeId]);

  const totalDays = summary?.working_days_this_month ?? 0;
  const actualDays = summary?.actual_working_days ?? 0;
  const leaveDays = Math.max(totalDays - actualDays, 0);

  const today = istDateParts(new Date().toISOString());
  const last7 = Array.from({ length: 7 }, (_, i) =>
    addDaysUTC(today, -(6 - i)),
  );

  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-IN", {
    month: "long",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="bg-brand-nightSurface rounded-xl2 border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-brand-nightText">
          Attendance — {monthLabel}
        </p>
        <p className="text-[11px] text-brand-nightText/40">
          Venue closed Tuesdays
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <StatBlock
          icon={CalendarRange}
          tone="sky"
          value={totalDays}
          label="Total open days"
          loading={loading}
        />
        <StatBlock
          icon={CalendarCheck2}
          tone="leaf"
          value={actualDays}
          label="Days present"
          loading={loading}
        />
        <StatBlock
          icon={CalendarX2}
          tone="coral"
          value={leaveDays}
          label="Leaves"
          loading={loading}
        />
      </div>

      <div>
        <p className="text-[11px] font-semibold text-brand-nightText/40 mb-1.5">
          Last 7 days
        </p>
        <div className="flex gap-1.5">
          {last7.map((d) => {
            const key = dateKey(d);
            const isClosed = weekdayOfUTC(d) === CLOSED_WEEKDAY;
            const isPresent = presentDays.has(key);
            const tone = isClosed
              ? "bg-white/8"
              : isPresent
                ? "bg-brand-leaf"
                : "bg-brand-coral/70";
            return (
              <span
                key={key}
                className={`flex-1 h-[10px] rounded-full ${tone}`}
                title={key}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
