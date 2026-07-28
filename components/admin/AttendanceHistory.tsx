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
