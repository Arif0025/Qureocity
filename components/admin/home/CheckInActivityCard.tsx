"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

type DailyCount = { day: string; cnt: number };

const CLOSED_WEEKDAY = 2; // Tuesday
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Cell = {
  date: string;
  count: number;
  weekday: number;
  isClosed: boolean;
};

function dayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return `${values.year}-${values.month}-${values.day}`;
}

function intensityClass(count: number, maxCount: number): string {
  if (count === 0)
    return "bg-brand-nightBg ring-1 ring-inset ring-white/20 text-brand-nightText/80";
  const ratio = count / maxCount;
  if (ratio <= 0.25)
    return "bg-brand-sky/60 ring-1 ring-inset ring-brand-sky/50 text-white";
  if (ratio <= 0.5)
    return "bg-brand-sky/75 ring-1 ring-inset ring-brand-sky/60 text-white";
  if (ratio <= 0.75)
    return "bg-brand-sky/90 ring-1 ring-inset ring-brand-sky/70 text-white";
  return "bg-brand-sky ring-1 ring-inset ring-white/30 text-white";
}

export default function CheckInActivityCard({
  dailyCounts,
  onViewFull,
}: {
  dailyCounts: DailyCount[];
  onViewFull: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const countByDay = new Map(dailyCounts.map((d) => [d.day, Number(d.cnt)]));
  const maxCount = Math.max(1, ...dailyCounts.map((d) => Number(d.cnt)));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(1 - calendarStart.getDay());
  const cells: Cell[] = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const key = dayKey(date);
    const weekday = date.getDay();
    return {
      date: key,
      count: countByDay.get(key) ?? 0,
      weekday,
      isClosed: weekday === CLOSED_WEEKDAY,
    };
  });
  const totalCount = dailyCounts.reduce((acc, day) => acc + Number(day.cnt), 0);

  return (
    <div className="bg-brand-nightSurface rounded-2xl border border-white/10 flex flex-col">
      <button
        onClick={onViewFull}
        className="flex items-center justify-between px-5 pt-5 pb-1 text-left group"
      >
        <div>
          <p className="font-semibold text-brand-nightText group-hover:text-brand-sky transition-colors">
            Check-in activity
          </p>
          <p className="text-xs text-brand-nightText/40 mt-0.5">
            This month · {totalCount} check-in
            {totalCount === 1 ? "" : "s"}
          </p>
        </div>
        <ChevronRight
          size={18}
          className="text-brand-nightText/25 group-hover:text-brand-sky transition-colors shrink-0"
        />
      </button>

      <div className="px-5 py-5">
        <div className="w-full">
          <p className="text-center text-sm font-semibold text-brand-nightText mb-3">
            {monthStart.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </p>
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAY_LABELS.map((label) => (
              <span
                key={label}
                className="text-center text-[10px] font-medium text-brand-nightText/40"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((cell) => {
              const inMonth =
                new Date(cell.date + "T00:00:00Z").getUTCMonth() ===
                monthStart.getMonth();
              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={!inMonth}
                  onClick={() => setSelectedDate(cell.date)}
                  title={
                    cell.isClosed
                      ? `${cell.date}: Closed`
                      : `${cell.date}: ${cell.count} check-in${cell.count === 1 ? "" : "s"}`
                  }
                  className={`min-h-[38px] rounded-md flex flex-col items-center justify-center gap-0.5 text-[10px] hover:ring-2 hover:ring-brand-sky focus:outline-none focus:ring-2 focus:ring-brand-sky disabled:opacity-25 ${cell.isClosed ? "bg-brand-coral/45 text-white ring-1 ring-inset ring-brand-coral/80" : intensityClass(cell.count, maxCount)}`}
                >
                  <span className="font-semibold leading-none">
                    {new Date(cell.date + "T00:00:00Z").getUTCDate()}
                  </span>
                  {!cell.isClosed && (
                    <span className="text-[9px] leading-none opacity-75">
                      {cell.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selectedDate && (
          <div className="mt-3 rounded-xl bg-brand-nightSurface2 px-3 py-2 text-xs text-brand-nightText">
            <span className="font-semibold">
              {new Date(selectedDate + "T00:00:00Z").toLocaleDateString(
                undefined,
                {
                  timeZone: "Asia/Kolkata",
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                },
              )}
              :
            </span>{" "}
            {new Date(selectedDate + "T00:00:00Z").getUTCDay() ===
            CLOSED_WEEKDAY
              ? "Venue closed"
              : `${countByDay.get(selectedDate) ?? 0} check-in${(countByDay.get(selectedDate) ?? 0) === 1 ? "" : "s"}`}
          </div>
        )}
      </div>
    </div>
  );
}
