"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

type DailyCount = { day: string; cnt: number };

const CLOSED_WEEKDAY = 2; // Tuesday
const WEEKS_SHOWN = 4;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Cell = {
  date: string;
  count: number;
  weekday: number;
  isClosed: boolean;
} | null;

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
  if (count === 0) return "bg-brand-nightBg/60 ring-1 ring-inset ring-white/10";
  const ratio = count / maxCount;
  if (ratio <= 0.25)
    return "bg-brand-sky/30 ring-1 ring-inset ring-brand-sky/20";
  if (ratio <= 0.5)
    return "bg-brand-sky/55 ring-1 ring-inset ring-brand-sky/25";
  if (ratio <= 0.75)
    return "bg-brand-sky/80 ring-1 ring-inset ring-brand-sky/30";
  return "bg-brand-sky ring-1 ring-inset ring-white/20";
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

  const totalDays = WEEKS_SHOWN * 7;
  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - (totalDays - 1) - today.getDay());

  const cells: Cell[] = [];
  const cursor = new Date(rangeStart);
  while (cursor <= today) {
    const key = dayKey(cursor);
    const weekday = cursor.getDay();
    cells.push({
      date: key,
      count: countByDay.get(key) ?? 0,
      weekday,
      isClosed: weekday === CLOSED_WEEKDAY,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const totalCount = cells.reduce((acc, c) => acc + (c ? c.count : 0), 0);

  const monthLabelForWeek = new Map<number, string>();
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstReal = week.find((c) => c !== null);
    if (!firstReal) return;
    const month = new Date(firstReal.date + "T00:00:00Z").getUTCMonth();
    if (month !== lastMonth) {
      monthLabelForWeek.set(
        wi,
        new Date(firstReal.date + "T00:00:00Z").toLocaleDateString(undefined, {
          timeZone: "Asia/Kolkata",
          month: "short",
        }),
      );
      lastMonth = month;
    }
  });

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
            Last {WEEKS_SHOWN} weeks · {totalCount} check-in
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
          <div className="flex gap-2 mb-1.5 pl-8">
            {weeks.map((_, wi) => (
              <div
                key={wi}
                className="flex-1 text-[10px] text-brand-nightText/40 text-center"
              >
                {monthLabelForWeek.get(wi) ?? ""}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="flex flex-col gap-2 mr-1 w-6 shrink-0">
              {WEEKDAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="flex-1 text-[10px] text-brand-nightText/40 flex items-center"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="flex flex-1 gap-2">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex-1 flex flex-col gap-2">
                  {week.map((cell, ri) =>
                    cell === null ? (
                      <div key={ri} className="w-full aspect-[5/3]" />
                    ) : (
                      <button
                        key={ri}
                        type="button"
                        onClick={() => setSelectedDate(cell.date)}
                        title={
                          cell.isClosed
                            ? `${cell.date}: Closed`
                            : `${cell.date}: ${cell.count} check-in${cell.count === 1 ? "" : "s"}`
                        }
                        className={`w-full aspect-[5/3] rounded-md hover:ring-2 hover:ring-brand-sky focus:outline-none focus:ring-2 focus:ring-brand-sky ${cell.isClosed ? "bg-brand-coral/20 ring-1 ring-inset ring-brand-coral/55" : intensityClass(cell.count, maxCount)}`}
                        style={
                          cell.isClosed
                            ? {
                                backgroundImage:
                                  "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.18) 2px, rgba(255,255,255,0.18) 3px)",
                              }
                            : undefined
                        }
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
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
