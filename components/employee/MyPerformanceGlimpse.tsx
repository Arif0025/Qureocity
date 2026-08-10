"use client";

import { useState, useEffect } from "react";
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

export default function MyPerformanceGlimpse({
  employeeId,
  onClick,
}: {
  employeeId: string;
  onClick: () => void;
}) {
  const supabase = createClient();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [presentDays, setPresentDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [supabase, employeeId]);

  const today = istDateParts(new Date().toISOString());
  const last7 = Array.from({ length: 7 }, (_, i) =>
    addDaysUTC(today, -(6 - i)),
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-brand-nightSurface rounded-xl2 border border-white/10 px-4 py-3 hover:border-brand-sky/30 transition-colors"
    >
      <p className="text-xs text-brand-nightText/40 mb-1.5">Attendance</p>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-extrabold text-brand-nightText leading-none">
            {loading ? "—" : (summary?.actual_working_days ?? 0)}
            <span className="text-xs font-normal text-brand-nightText/40">
              {" "}
              / {loading ? "—" : (summary?.working_days_this_month ?? 0)} days
            </span>
          </p>
        </div>
        <div className="flex gap-[3px]">
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
                className={`w-[10px] h-[10px] rounded-[2px] ${tone}`}
              />
            );
          })}
        </div>
      </div>
    </button>
  );
}
