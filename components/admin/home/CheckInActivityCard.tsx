"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

type DailyCount = { day: string; cnt: number };

const CLOSED_WEEKDAY = 2; // Tuesday
const WEEKS_SHOWN = 12;
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

function intensityClass(count: number): string {
  if (count === 0) return "bg-brand-nightBg/60 ring-1 ring-inset ring-white/10";
  if (count <= 5) return "bg-brand-sky/30 ring-1 ring-inset ring-brand-sky/20";
  if (count <= 15) return "bg-brand-sky/55 ring-1 ring-inset ring-brand-sky/25";
  if (count <= 30) return "bg-brand-sky/80 ring-1 ring-inset ring-brand-sky/30";
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
    <div className="bg-brand-nightSurface rounded-2xl border border-white/10 flex flex-col h-[420px]">
      <button
        onClick={onViewFull}
        className="flex items-center justify-between px-5 pt-5 pb-1 text-left group"
      >
        <div>
          <p className="font-semibold text-brand-nightText group-hover:text-brand-sky transition-colors">
            Check-in activity
          </p>
          <p className="text-xs text-brand-nightText/40 mt-0.5">
            Last {WEEKS_SHOWN} weeks
          </p>
        </div>
        <ChevronRight
          size={18}
          className="text-brand-nightText/25 group-hover:text-brand-sky transition-colors shrink-0"
        />
      </button>

      <div className="flex-1 flex flex-col justify-center px-5 pb-5 overflow-x-auto">
        <div className="inline-block">
          <div className="flex gap-[4px] mb-1.5 pl-7">
            {weeks.map((_, wi) => (
              <div
                key={wi}
                className="w-[18px] text-[10px] text-brand-nightText/40 shrink-0"
              >
                {monthLabelForWeek.get(wi) ?? ""}
              </div>
            ))}
          </div>

          <div className="flex gap-[4px]">
            <div className="flex flex-col gap-[4px] mr-1 w-6 shrink-0">
              {WEEKDAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="h-[18px] text-[10px] text-brand-nightText/40 leading-[18px]"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="flex gap-[4px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[4px]">
                  {week.map((cell, ri) =>
                    cell === null ? (
                      <div key={ri} className="w-[18px] h-[18px]" />
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
                        className={`w-[18px] h-[18px] rounded-[4px] hover:ring-2 hover:ring-brand-sky focus:outline-none focus:ring-2 focus:ring-brand-sky ${cell.isClosed ? "bg-brand-coral/20 ring-1 ring-inset ring-brand-coral/55" : intensityClass(cell.count)}`}
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

          <div className="flex items-center gap-1.5 text-[11px] text-brand-nightText/40 mt-3 pl-7">
            <span>Less</span>
            <span className="w-3 h-3 rounded-sm bg-brand-nightBg/60 ring-1 ring-inset ring-white/10" />
            <span className="w-3 h-3 rounded-sm bg-brand-sky/25" />
            <span className="w-3 h-3 rounded-sm bg-brand-sky/50" />
            <span className="w-3 h-3 rounded-sm bg-brand-sky/75" />
            <span className="w-3 h-3 rounded-sm bg-brand-sky" />
            <span>More</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-brand-nightText/45 mt-2 pl-7">
            <span className="w-3 h-3 rounded-sm bg-brand-coral/20 ring-1 ring-inset ring-brand-coral/55" />
            <span>Closed on Tuesdays</span>
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
