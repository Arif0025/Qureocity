"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { formatTimeIST, istDateParts, dateKey } from "@/lib/formatTime";

type LogRow = {
  id: string;
  punch_in: string;
  punch_out: string | null;
};

type DayParts = { year: number; month: number; date: number };

// Pure calendar-day math using Date.UTC as a calculator only (never as a
// real moment in time) — this is what keeps grid cells, month navigation,
// and log matching all agreeing on the same day, regardless of what
// timezone the viewing device happens to be set to. The bug this
// replaces: building keys via `someDate.toISOString().slice(0, 10)`
// round-trips a *local* date through UTC, which shifts the date by a day
// for any viewer west of Greenwich relative to their own local midnight
// (e.g. IST viewers), so the calendar grid and the detail panel ended up
// keying the same click to two different days.
function addDays(parts: DayParts, delta: number): DayParts {
  const utc = new Date(Date.UTC(parts.year, parts.month, parts.date + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth(),
    date: utc.getUTCDate(),
  };
}

function weekdayOf(parts: DayParts): number {
  return new Date(Date.UTC(parts.year, parts.month, parts.date)).getUTCDay();
}

function shiftMonth(parts: DayParts, delta: number): DayParts {
  const utc = new Date(Date.UTC(parts.year, parts.month + delta, 1));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth(), date: 1 };
}

function timeStr(v: string) {
  return formatTimeIST(v);
}

function durationStr(punchIn: string, punchOut: string | null): string {
  const end = punchOut ? new Date(punchOut) : new Date();
  const mins = Math.max(
    0,
    Math.round((end.getTime() - new Date(punchIn).getTime()) / 60000),
  );
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function EmployeeCalendar({ logs }: { logs: LogRow[] }) {
  const logsByDay = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    logs.forEach((log) => {
      const key = dateKey(istDateParts(log.punch_in));
      map.set(key, [...(map.get(key) ?? []), log]);
    });
    return map;
  }, [logs]);

  const [cursor, setCursor] = useState<DayParts>(() => {
    const first = logs[0]
      ? istDateParts(logs[0].punch_in)
      : istDateParts(new Date().toISOString());
    return { year: first.year, month: first.month, date: 1 };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(
    logs[0] ? dateKey(istDateParts(logs[0].punch_in)) : null,
  );

  const firstOfMonth: DayParts = {
    year: cursor.year,
    month: cursor.month,
    date: 1,
  };
  const leadingBlanks = weekdayOf(firstOfMonth);
  const calendarStart = addDays(firstOfMonth, -leadingBlanks);
  const days: DayParts[] = Array.from({ length: 42 }, (_, i) =>
    addDays(calendarStart, i),
  );

  const selectedLogs = selectedDay ? (logsByDay.get(selectedDay) ?? []) : [];
  const selectedParts = selectedDay ? selectedDay.split("-").map(Number) : null;

  return (
    <div className="grid md:grid-cols-[1fr_260px] gap-4">
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-brand-nightText">
            {MONTH_NAMES[cursor.month]} {cursor.year}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCursor(shiftMonth(cursor, -1))}
              className="p-1.5 rounded-lg hover:bg-white/8 text-brand-nightText/50"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCursor(shiftMonth(cursor, 1))}
              className="p-1.5 rounded-lg hover:bg-white/8 text-brand-nightText/50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span
              key={i}
              className="text-center text-[10px] text-brand-nightText/40"
            >
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const key = dateKey(day);
            const records = logsByDay.get(key) ?? [];
            const inMonth = day.month === cursor.month;
            const tone =
              records.length > 1
                ? "bg-brand-sky text-white"
                : records.length === 1
                  ? "bg-brand-sky/35 text-brand-nightText"
                  : "bg-white/[0.05] text-brand-nightText/40";
            return (
              <button
                key={key}
                type="button"
                disabled={!inMonth}
                onClick={() => setSelectedDay(key)}
                className={`aspect-square rounded-lg text-xs font-medium disabled:opacity-20 transition-colors ${tone} ${
                  selectedDay === key
                    ? "ring-2 ring-brand-skyLight ring-offset-1 ring-offset-brand-nightSurface"
                    : ""
                }`}
              >
                {day.date}
              </button>
            );
          })}
        </div>
      </div>

      {/* Prominent side panel — this replaces the small bar that used to
          sit under the calendar grid. */}
      <div className="rounded-xl border border-white/10 bg-brand-nightSurface2/50 p-4">
        {!selectedDay || !selectedParts ? (
          <p className="text-sm text-brand-nightText/35">
            Select a date to see punch details.
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-brand-nightText mb-1">
              {
                WEEKDAY_NAMES[
                  weekdayOf({
                    year: selectedParts[0],
                    month: selectedParts[1] - 1,
                    date: selectedParts[2],
                  })
                ]
              }
            </p>
            <p className="text-xs text-brand-nightText/40 mb-3">
              {MONTH_NAMES[selectedParts[1] - 1]} {selectedParts[2]},{" "}
              {selectedParts[0]}
            </p>
            {selectedLogs.length === 0 ? (
              <p className="text-sm text-brand-nightText/35">
                No attendance record.
              </p>
            ) : (
              <div className="space-y-3">
                {selectedLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg bg-brand-nightSurface px-3 py-2.5"
                  >
                    <p className="flex items-center gap-1.5 text-sm font-medium text-brand-nightText">
                      <Clock size={13} className="text-brand-nightText/40" />
                      {timeStr(log.punch_in)}
                      {" – "}
                      {log.punch_out ? (
                        timeStr(log.punch_out)
                      ) : (
                        <span className="text-brand-leaf">on duty</span>
                      )}
                    </p>
                    <p className="text-xs text-brand-nightText/40 mt-1">
                      {durationStr(log.punch_in, log.punch_out)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
