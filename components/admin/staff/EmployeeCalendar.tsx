"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Clock, Pencil, Plus } from "lucide-react";
import { formatTimeIST, istDateParts, dateKey } from "@/lib/formatTime";

type LogRow = {
  id: string;
  punch_in: string;
  punch_out: string | null;
};

type Shift = { start_time: string; end_time: string } | null;

type DayParts = { year: number; month: number; date: number };

const CLOSED_WEEKDAY = 2; // Tuesday

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

function isAfter(a: DayParts, b: DayParts): boolean {
  if (a.year !== b.year) return a.year > b.year;
  if (a.month !== b.month) return a.month > b.month;
  return a.date > b.date;
}

function timeStr(v: string) {
  return formatTimeIST(v);
}

function minutesBetween(start: string, end: string): number {
  return Math.max(
    0,
    (new Date(end).getTime() - new Date(start).getTime()) / 60000,
  );
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

function toDateTimeLocalIST(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60_000)
    .toISOString()
    .slice(0, 16);
}

function toIsoFromIST(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function shiftMinutes(shift: Shift): number {
  if (!shift) return 0;
  const [sh, sm] = shift.start_time.split(":").map(Number);
  const [eh, em] = shift.end_time.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

type DayStatus =
  | "closed"
  | "future"
  | "no-data"
  | "absent"
  | "undertime"
  | "present"
  | "overtime";

const STATUS_TONE: Record<DayStatus, string> = {
  closed: "bg-white/[0.08] text-brand-nightText/35",
  future: "bg-white/[0.05] text-brand-nightText/25",
  "no-data": "bg-white/[0.05] text-brand-nightText/25",
  absent: "bg-brand-coral/60 text-white",
  undertime: "bg-brand-sun/70 text-brand-ink",
  present: "bg-brand-leaf text-white",
  overtime: "bg-brand-sky text-white",
};

const LEGEND: { status: DayStatus; label: string }[] = [
  { status: "present", label: "Present" },
  { status: "overtime", label: "Overtime" },
  { status: "undertime", label: "Undertime" },
  { status: "absent", label: "Absent" },
  { status: "closed", label: "Closed" },
];

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

export default function EmployeeCalendar({
  logs,
  shift = null,
  varianceThresholdMins = 30,
  showLegend = false,
  editable = false,
  onSaveAttendance,
}: {
  logs: LogRow[];
  // When provided, days get classified against the shift (present /
  // overtime / undertime) instead of just showing whether a punch
  // happened. Without a shift there's nothing to compare hours against,
  // so days just show present/no-data.
  shift?: Shift;
  varianceThresholdMins?: number;
  showLegend?: boolean;
  editable?: boolean;
  onSaveAttendance?: (input: {
    logId: string | null;
    punchIn: string;
    punchOut: string | null;
  }) => Promise<string | null>;
}) {
  const logsByDay = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    logs.forEach((log) => {
      const key = dateKey(istDateParts(log.punch_in));
      map.set(key, [...(map.get(key) ?? []), log]);
    });
    return map;
  }, [logs]);

  const today = useMemo(() => istDateParts(new Date().toISOString()), []);
  const shiftMins = useMemo(() => shiftMinutes(shift), [shift]);

  const [cursor, setCursor] = useState<DayParts>(() => {
    const first = logs[0]
      ? istDateParts(logs[0].punch_in)
      : istDateParts(new Date().toISOString());
    return { year: first.year, month: first.month, date: 1 };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(
    logs[0] ? dateKey(istDateParts(logs[0].punch_in)) : null,
  );
  const [editingLog, setEditingLog] = useState<LogRow | null | undefined>(
    undefined,
  );
  const [punchInInput, setPunchInInput] = useState("");
  const [punchOutInput, setPunchOutInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  const statusFor = (day: DayParts, records: LogRow[]): DayStatus => {
    if (weekdayOf(day) === CLOSED_WEEKDAY) return "closed";
    if (isAfter(day, today)) return "future";
    if (records.length === 0) return shift ? "absent" : "no-data";
    if (!shift) return "present";
    const workedMins = records.reduce(
      (sum, r) =>
        sum +
        minutesBetween(r.punch_in, r.punch_out ?? new Date().toISOString()),
      0,
    );
    if (workedMins >= shiftMins + varianceThresholdMins) return "overtime";
    if (workedMins <= shiftMins - varianceThresholdMins) return "undertime";
    return "present";
  };

  const selectedLogs = selectedDay ? (logsByDay.get(selectedDay) ?? []) : [];
  const selectedParts = selectedDay ? selectedDay.split("-").map(Number) : null;

  const startEdit = (log: LogRow | null) => {
    if (!selectedDay) return;
    setEditingLog(log);
    setPunchInInput(
      log
        ? toDateTimeLocalIST(log.punch_in)
        : `${selectedDay}T09:00`,
    );
    setPunchOutInput(log?.punch_out ? toDateTimeLocalIST(log.punch_out) : `${selectedDay}T18:00`);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!onSaveAttendance) return;
    const punchIn = toIsoFromIST(punchInInput);
    const punchOut = toIsoFromIST(punchOutInput);
    if (!punchIn) return setEditError("Enter a valid punch-in time.");
    if (punchOut && new Date(punchOut) < new Date(punchIn)) {
      return setEditError("Punch-out cannot be earlier than punch-in.");
    }
    setSaving(true);
    const error = await onSaveAttendance({
      logId: editingLog?.id ?? null,
      punchIn,
      punchOut,
    });
    setSaving(false);
    if (error) return setEditError(error);
    setEditingLog(undefined);
  };

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
            const status = statusFor(day, records);
            const tone = STATUS_TONE[status];
            return (
              <button
                key={key}
                type="button"
                disabled={!inMonth}
                onClick={() => setSelectedDay(key)}
                title={status}
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

        {showLegend && (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
            {LEGEND.map((l) => (
              <span
                key={l.status}
                className="flex items-center gap-1.5 text-[11px] text-brand-nightText/45"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-sm ${STATUS_TONE[l.status].split(" ")[0]}`}
                />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Prominent side panel — shows punch-in/out times for whatever
          day is selected, tapping any cell in the grid jumps here. */}
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
              <>
                <p className="text-sm text-brand-nightText/35">
                  No attendance record.
                </p>
                {editable && !isAfter({ year: selectedParts[0], month: selectedParts[1] - 1, date: selectedParts[2] }, today) && (
                  <button
                    type="button"
                    onClick={() => startEdit(null)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-sky hover:text-brand-skyLight"
                  >
                    <Plus size={13} /> Add attendance
                  </button>
                )}
              </>
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
                    {editable && (
                      <button
                        type="button"
                        onClick={() => startEdit(log)}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-sky hover:text-brand-skyLight"
                      >
                        <Pencil size={12} /> Edit times
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {editingLog !== undefined && (
              <div className="mt-4 border-t border-white/10 pt-4 space-y-3">
                <p className="text-xs font-semibold text-brand-nightText">
                  {editingLog ? "Edit attendance" : "Add attendance"}
                </p>
                <label className="block text-xs text-brand-nightText/50">
                  Punch in
                  <input
                    type="datetime-local"
                    value={punchInInput}
                    onChange={(event) => setPunchInInput(event.target.value)}
                    className="mt-1 w-full min-h-[38px] rounded-lg border border-white/15 bg-brand-nightSurface text-brand-nightText px-2 text-xs"
                  />
                </label>
                <label className="block text-xs text-brand-nightText/50">
                  Punch out
                  <input
                    type="datetime-local"
                    value={punchOutInput}
                    onChange={(event) => setPunchOutInput(event.target.value)}
                    className="mt-1 w-full min-h-[38px] rounded-lg border border-white/15 bg-brand-nightSurface text-brand-nightText px-2 text-xs"
                  />
                </label>
                {editError && <p className="text-xs text-brand-coral">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    disabled={saving}
                    className="min-h-[34px] rounded-lg bg-brand-sky px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save times"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingLog(undefined)}
                    className="min-h-[34px] rounded-lg border border-white/15 px-3 text-xs font-semibold text-brand-nightText/55"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
