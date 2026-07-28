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

type DayCell = {
  date: string;
  count: number;
} | null;

function employeeName(employees: LogRow["employees"]): string {
  if (Array.isArray(employees)) return employees[0]?.name ?? "—";
  return employees?.name ?? "—";
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function minutesBetween(start: string, end: string | null): number | null {
  if (!end) return null;
  return Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000),
  );
}

function durationLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDateLabel(value: string): string {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatTimeLabel(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildHeatmap(logs: LogRow[]): DayCell[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 55);

  const countByDay = new Map<string, number>();
  for (const log of logs) {
    const key = dayKey(log.punch_in);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const cells: DayCell[] = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    cells.push({ date: key, count: countByDay.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
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

  const heatmapCells = buildHeatmap(employeeHistory);
  const totalMinutes = employeeHistory.reduce((sum, log) => {
    const mins = minutesBetween(log.punch_in, log.punch_out);
    return sum + (mins ?? 0);
  }, 0);
  const workedDays = new Set(employeeHistory.map((log) => dayKey(log.punch_in)));
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaysLog = employeeHistory.find((log) => dayKey(log.punch_in) === todayKey);
  const currentStatus = todaysLog
    ? todaysLog.punch_out
      ? "Left today"
      : "Present on site"
    : "Absent today";
  const currentStatusTone = todaysLog
    ? todaysLog.punch_out
      ? "bg-black/5 text-brand-ink"
      : "bg-brand-leaf/10 text-brand-leaf"
    : "bg-brand-coral/10 text-brand-coral";

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

    setEmployeeHistory(((data ?? []) as unknown) as LogRow[]);
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
                  Showing attendance performance, heatmap, and punch drill-down.
                </p>
              </div>
              {loadingHistory && (
                <span className="text-xs font-medium text-brand-ink/40">
                  Loading…
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
              <div className="rounded-xl bg-white border border-black/5 px-3 py-2">
                <p className="text-[11px] font-medium text-brand-ink/40">
                  Current status
                </p>
                <p className={`text-sm font-semibold inline-flex px-2 py-1 rounded-full ${currentStatusTone}`}>
                  {currentStatus}
                </p>
              </div>
              <div className="rounded-xl bg-white border border-black/5 px-3 py-2">
                <p className="text-[11px] font-medium text-brand-ink/40">Days recorded</p>
                <p className="text-lg font-bold text-brand-ink">{workedDays.size}</p>
              </div>
              <div className="rounded-xl bg-white border border-black/5 px-3 py-2">
                <p className="text-[11px] font-medium text-brand-ink/40">Punch records</p>
                <p className="text-lg font-bold text-brand-ink">{employeeHistory.length}</p>
              </div>
              <div className="rounded-xl bg-white border border-black/5 px-3 py-2">
                <p className="text-[11px] font-medium text-brand-ink/40">Total time</p>
                <p className="text-lg font-bold text-brand-ink">{totalMinutes > 0 ? durationLabel(totalMinutes) : "—"}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-black/5 p-4 mb-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="font-semibold text-brand-ink">Attendance heatmap</p>
                <p className="text-[11px] text-brand-ink/40">Last 8 weeks</p>
              </div>
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  <div className="grid grid-cols-7 gap-1">
                    {heatmapCells.map((cell, index) =>
                      cell === null ? (
                        <div key={index} className="aspect-square rounded-md bg-transparent" />
                      ) : (
                        <div
                          key={cell.date}
                          title={`${formatDateLabel(cell.date)}: ${cell.count} punch${cell.count === 1 ? "" : "es"}`}
                          className={`aspect-square rounded-md ${
                            cell.count === 0
                              ? "bg-black/5"
                              : cell.count === 1
                                ? "bg-brand-sky/25"
                                : cell.count === 2
                                  ? "bg-brand-sky/45"
                                  : cell.count === 3
                                    ? "bg-brand-sky/65"
                                    : "bg-brand-sky"
                          }`}
                        />
                      ),
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-[11px] text-brand-ink/40 flex-wrap">
                    <span>Less</span>
                    <span className="w-3.5 h-3.5 rounded-sm bg-black/5" />
                    <span className="w-3.5 h-3.5 rounded-sm bg-brand-sky/25" />
                    <span className="w-3.5 h-3.5 rounded-sm bg-brand-sky/45" />
                    <span className="w-3.5 h-3.5 rounded-sm bg-brand-sky/65" />
                    <span className="w-3.5 h-3.5 rounded-sm bg-brand-sky" />
                    <span>More</span>
                  </div>
                </div>
              </div>
            </div>

            {historyError && (
              <p className="text-sm text-brand-coral mb-3">{historyError}</p>
            )}

            {employeeHistory.length === 0 && !loadingHistory ? (
              <p className="text-sm text-brand-ink/40">
                No history found for this employee.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[560px]">
                  <thead className="text-brand-ink/40">
                    <tr>
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Punched in</th>
                      <th className="pb-2 font-medium">Punched out</th>
                      <th className="pb-2 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeHistory.map((log) => (
                      <tr key={log.id} className="border-t border-black/5">
                        <td className="py-3 text-brand-ink/60">
                          {new Date(log.punch_in).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-3 text-brand-ink/60">
                          {new Date(log.punch_in).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3 text-brand-ink/60">
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
                        <td className="py-3 text-brand-ink/60">
                          {formatDuration(log.punch_in, log.punch_out)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
