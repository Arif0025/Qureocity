"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { formatTimeIST } from "@/lib/formatTime";

type LogRow = {
  id: string;
  punch_in: string;
  punch_out: string | null;
};

function dayKey(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
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

export default function EmployeeCalendar({ logs }: { logs: LogRow[] }) {
  const logsByDay = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    logs.forEach((log) => {
      const key = dayKey(log.punch_in);
      map.set(key, [...(map.get(key) ?? []), log]);
    });
    return map;
  }, [logs]);

  const [cursor, setCursor] = useState(() => {
    const d = new Date(logs[0]?.punch_in ?? Date.now());
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(
    logs[0] ? dayKey(logs[0].punch_in) : null,
  );

  const calendarStart = new Date(cursor);
  calendarStart.setDate(1 - calendarStart.getDay());
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(calendarStart);
    d.setDate(calendarStart.getDate() + i);
    return d;
  });

  const selectedLogs = selectedDay ? (logsByDay.get(selectedDay) ?? []) : [];

  return (
    <div className="grid md:grid-cols-[1fr_260px] gap-4">
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-brand-nightText">
            {cursor.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const d = new Date(cursor);
                d.setMonth(d.getMonth() - 1);
                setCursor(d);
              }}
              className="p-1.5 rounded-lg hover:bg-white/8 text-brand-nightText/50"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                const d = new Date(cursor);
                d.setMonth(d.getMonth() + 1);
                setCursor(d);
              }}
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
            const key = day.toISOString().slice(0, 10);
            const records = logsByDay.get(key) ?? [];
            const inMonth = day.getMonth() === cursor.getMonth();
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
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Prominent side panel — this replaces the small bar that used to
          sit under the calendar grid. */}
      <div className="rounded-xl border border-white/10 bg-brand-nightSurface2/50 p-4">
        {!selectedDay ? (
          <p className="text-sm text-brand-nightText/35">
            Select a date to see punch details.
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-brand-nightText mb-1">
              {new Date(selectedDay + "T00:00:00").toLocaleDateString(
                undefined,
                { weekday: "long" },
              )}
            </p>
            <p className="text-xs text-brand-nightText/40 mb-3">
              {new Date(selectedDay + "T00:00:00").toLocaleDateString(
                undefined,
                { month: "long", day: "numeric", year: "numeric" },
              )}
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
