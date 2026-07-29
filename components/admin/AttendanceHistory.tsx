"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LogRow = {
  id: string;
  employee_id: string;
  punch_in: string;
  punch_out: string | null;
  employees: { name: string } | { name: string }[] | null;
};

function employeeName(employees: LogRow["employees"]): string {
  if (Array.isArray(employees)) return employees[0]?.name ?? "—";
  return employees?.name ?? "—";
}

function formatDuration(punchIn: string, punchOut: string | null): string {
  if (!punchOut) return "—";
  const mins = Math.round(
    (new Date(punchOut).getTime() - new Date(punchIn).getTime()) / 60000,
  );
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function dayKey(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function totalDuration(logs: LogRow[]): string {
  const minutes = logs.reduce((sum, log) => {
    const end = log.punch_out ? new Date(log.punch_out) : new Date();
    return sum + Math.max(0, Math.round((end.getTime() - new Date(log.punch_in).getTime()) / 60000));
  }, 0);
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function AttendanceCalendar({ logs }: { logs: LogRow[] }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const visitsByDate = new Map<string, LogRow[]>();
  logs.forEach((log) => {
    const key = dayKey(log.punch_in);
    visitsByDate.set(key, [...(visitsByDate.get(key) ?? []), log]);
  });
  const activeDate = selectedDate ?? dayKey(logs[0]?.punch_in ?? new Date().toISOString());
  const month = new Date(logs[0]?.punch_in ?? Date.now());
  month.setDate(1);
  const calendarStart = new Date(month);
  calendarStart.setDate(1 - calendarStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-brand-ink">Attendance calendar</p>
          <p className="text-xs text-brand-ink/40">Darker days have more punch records. Select a date for the details.</p>
        </div>
        <span className="text-xs font-medium text-brand-ink/50">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
      </div>
      <div className="grid grid-cols-7 gap-1 max-w-md">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`} className="text-center text-[10px] text-brand-ink/40">{day}</span>)}
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const records = visitsByDate.get(key) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          const tone = records.length > 1 ? "bg-brand-sky text-white" : records.length === 1 ? "bg-brand-sky/35 text-brand-ink" : "bg-black/[0.035] text-brand-ink/50";
          return <button key={key} type="button" disabled={!inMonth} onClick={() => setSelectedDate(key)} className={`aspect-square rounded-lg text-xs font-medium disabled:opacity-25 ${tone} ${activeDate === key ? "ring-2 ring-brand-ink ring-offset-1" : ""}`}>{day.getDate()}</button>;
        })}
      </div>
      <div className="mt-4 rounded-xl bg-brand-cloud px-3 py-2 text-sm text-brand-ink">
        <span className="font-semibold">{new Date(activeDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}:</span>{" "}
        {visitsByDate.has(activeDate) ? visitsByDate.get(activeDate)!.map((log) => `${new Date(log.punch_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${log.punch_out ? new Date(log.punch_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "currently on duty"}`).join(", ") : "No attendance record"}
      </div>
    </div>
  );
}

export default function AttendanceHistory({ logs }: { logs: LogRow[] }) {
  const supabase = createClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );
  const [selectedEmployeeName, setSelectedEmployeeName] = useState<
    string | null
  >(null);
  const [employeeHistory, setEmployeeHistory] = useState<LogRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = async (employeeId: string, employeeName: string) => {
    if (selectedEmployeeId === employeeId) {
      setSelectedEmployeeId(null);
      setSelectedEmployeeName(null);
      setEmployeeHistory([]);
      setHistoryError(null);
      setLoadingHistory(false);
      return;
    }

    setSelectedEmployeeId(employeeId);
    setSelectedEmployeeName(employeeName);
    setEmployeeHistory([]);
    setLoadingHistory(true);
    setHistoryError(null);

    const { data, error } = await supabase
      .from("attendance_logs")
      .select("id, employee_id, punch_in, punch_out, employees(name)")
      .eq("employee_id", employeeId)
      .order("punch_in", { ascending: false })
      .limit(200);

    setLoadingHistory(false);

    if (error) {
      setHistoryError(error.message);
      setEmployeeHistory([]);
      return;
    }

    setEmployeeHistory((data as LogRow[]) ?? []);
  };

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-8 text-center text-brand-ink/40">
        No attendance records yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[560px]">
          <thead className="bg-black/[0.02] text-brand-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Employee</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Punched in</th>
              <th className="px-5 py-3 font-medium">Punched out</th>
              <th className="px-5 py-3 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className={`border-t border-black/5 ${
                  selectedEmployeeId === log.employee_id ? "bg-brand-sky/5" : ""
                }`}
              >
                <td className="px-5 py-3 font-medium text-brand-ink">
                  <button
                    type="button"
                    onClick={() =>
                      void loadHistory(
                        log.employee_id,
                        employeeName(log.employees),
                      )
                    }
                    className="text-left hover:text-brand-sky transition-colors"
                  >
                    {employeeName(log.employees)}
                  </button>
                </td>
                <td className="px-5 py-3 text-brand-ink/60">
                  {new Date(log.punch_in).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="px-5 py-3 text-brand-ink/60">
                  {new Date(log.punch_in).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-5 py-3 text-brand-ink/60">
                  {log.punch_out ? (
                    new Date(log.punch_out).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  ) : (
                    <span className="text-brand-leaf font-medium">
                      Still on duty
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-brand-ink/60">
                  {formatDuration(log.punch_in, log.punch_out)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-black/5 bg-black/[0.015] p-5">
        {!selectedEmployeeId ? (
          <p className="text-sm text-brand-ink/40">
            Click an employee name to view their attendance history.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="font-semibold text-brand-ink">
                  {selectedEmployeeName}'s history
                </p>
                <p className="text-xs text-brand-ink/40">
                  Showing the most recent attendance records for this employee.
                </p>
                {employeeHistory.length > 0 && !loadingHistory && (
                  <p className="text-sm font-semibold text-brand-sky mt-2">
                    Total recorded time: {totalDuration(employeeHistory)}
                  </p>
                )}
              </div>
              {loadingHistory && (
                <span className="text-xs font-medium text-brand-ink/40">
                  Loading…
                </span>
              )}
            </div>

            {historyError && (
              <p className="text-sm text-brand-coral mb-3">{historyError}</p>
            )}

            {employeeHistory.length === 0 && !loadingHistory ? (
              <p className="text-sm text-brand-ink/40">
                No history found for this employee.
              </p>
            ) : !loadingHistory ? <AttendanceCalendar logs={employeeHistory} /> : null}
          </>
        )}
      </div>
    </div>
  );
}
