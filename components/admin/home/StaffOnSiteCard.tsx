"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronRight, ChevronDown, Clock, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST, istDateParts } from "@/lib/formatTime";

const CLOSED_WEEKDAY = 2; // Tuesday

type OnDutyLog = {
  employee_id: string;
  punch_in: string;
  employees: { name: string } | null;
};

function timeStr(v: string) {
  return formatTimeIST(v);
}

// Start of "today" in IST, as a UTC instant — needed to ask "did this
// employee punch in at all today" without the query drifting a day for
// non-IST server/browser clocks.
function istStartOfTodayISO(): string {
  const { year, month, date } = istDateParts(new Date().toISOString());
  // IST is UTC+5:30 — midnight IST is 18:30 UTC the previous day.
  return new Date(
    Date.UTC(year, month, date, 0, 0, 0) - 5.5 * 3600_000,
  ).toISOString();
}

export default function StaffOnSiteCard({
  initialOnDutyStaff,
  totalStaff,
  onViewAll,
}: {
  initialOnDutyStaff: OnDutyLog[];
  totalStaff: number;
  onViewAll: () => void;
}) {
  const [supabase] = useState(() => createClient());
  const [onDutyStaff, setOnDutyStaff] = useState(initialOnDutyStaff ?? []);
  const [absentCount, setAbsentCount] = useState<number | null>(null);
  const [isClosedToday, setIsClosedToday] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [punchingOutId, setPunchingOutId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("attendance_logs")
      .select("employee_id, punch_in, employees(name, role)")
      .is("punch_out", null);
    const onlyEmployees = ((data as any[]) ?? []).filter(
      (r) => r.employees?.role === "employee",
    );
    setOnDutyStaff(onlyEmployees);
  }, [supabase]);

  const refetchAbsent = useCallback(async () => {
    const today = istDateParts(new Date().toISOString());
    const isTuesday =
      new Date(Date.UTC(today.year, today.month, today.date)).getUTCDay() ===
      CLOSED_WEEKDAY;
    setIsClosedToday(isTuesday);
    if (isTuesday) {
      setAbsentCount(0);
      return;
    }
    // "Absent" is measured against the full employee roster, not against
    // who happens to have a standing shift assigned in the shifts table.
    // It used to compare against shifts, which meant any employee without
    // a shift row yet (the common case while shifts are still being set
    // up) was silently excluded from both sides of the count — so absent
    // stayed at 0 no matter who was actually missing. Comparing against
    // every role='employee' row (the same set the "Roster" stat already
    // counts) is the number this card is actually promising to show.
    const [{ data: rosterEmployees }, { data: todaysLogs }] = await Promise.all(
      [
        supabase.from("employees").select("id, role").eq("role", "employee"),
        supabase
          .from("attendance_logs")
          .select("employee_id")
          .gte("punch_in", istStartOfTodayISO()),
      ],
    );
    const presentIds = new Set(
      ((todaysLogs as { employee_id: string }[]) ?? []).map(
        (l) => l.employee_id,
      ),
    );
    const rosterIds = new Set(
      ((rosterEmployees as { id: string }[]) ?? []).map((e) => e.id),
    );
    let absent = 0;
    rosterIds.forEach((id) => {
      if (!presentIds.has(id)) absent += 1;
    });
    setAbsentCount(absent);
  }, [supabase]);

  useEffect(() => {
    // Punching in/out writes to attendance_logs — subscribing here means
    // this card (and its "on duty" count) updates the instant a punch
    // happens, with no page reload needed.
    void refetch();
    void refetchAbsent();
    const channel = supabase
      .channel("attendance_logs_home_card")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_logs" },
        () => {
          refetch();
          refetchAbsent();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refetch, refetchAbsent]);

  const handleForcePunchOut = async (employeeId: string) => {
    setPunchingOutId(employeeId);
    setConfirmingId(null);
    const { data, error } = await supabase.rpc("admin_force_punch_out", {
      p_employee_id: employeeId,
    });
    setPunchingOutId(null);
    if (error) {
      alert(error.message);
      return;
    }
    if (data && !(data as any).success) {
      alert("They're not currently punched in.");
    }
    void refetch();
  };

  return (
    <div className="bg-brand-nightSurface rounded-2xl border border-white/10 flex flex-col h-[420px]">
      <button
        onClick={onViewAll}
        className="flex items-center justify-between px-5 pt-5 pb-3 text-left group"
      >
        <p className="font-semibold text-brand-nightText group-hover:text-brand-sky transition-colors">
          Staff on site
        </p>
        <ChevronRight
          size={18}
          className="text-brand-nightText/25 group-hover:text-brand-sky transition-colors shrink-0"
        />
      </button>

      <div className="grid grid-cols-3 gap-2 px-5 mb-4">
        <div className="rounded-xl bg-brand-leaf/10 border border-brand-leaf/20 py-2 text-center">
          <p className="text-lg font-extrabold text-brand-leaf leading-none">
            {onDutyStaff.length}
          </p>
          <p className="text-[10px] text-brand-nightText/45 mt-1">On duty</p>
        </div>
        <div className="rounded-xl bg-white/[0.04] border border-white/10 py-2 text-center">
          <p className="text-lg font-extrabold text-brand-nightText leading-none">
            {totalStaff}
          </p>
          <p className="text-[10px] text-brand-nightText/45 mt-1">Roster</p>
        </div>
        <div
          className={`rounded-xl py-2 text-center border ${
            !isClosedToday && absentCount !== null && absentCount > 0
              ? "bg-brand-coral/15 border-brand-coral/40"
              : "bg-white/[0.04] border-white/10"
          }`}
        >
          <p
            className={`text-lg font-extrabold leading-none ${
              !isClosedToday && absentCount !== null && absentCount > 0
                ? "text-brand-coral"
                : "text-brand-nightText/40"
            }`}
          >
            {isClosedToday ? "—" : (absentCount ?? "—")}
          </p>
          <p className="text-[10px] text-brand-nightText/45 mt-1">
            {isClosedToday ? "Closed" : "Absent"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {onDutyStaff.length === 0 ? (
          <p className="text-sm text-brand-nightText/35 text-center py-10">
            No one is currently punched in.
          </p>
        ) : (
          <div className="space-y-1.5">
            {onDutyStaff.map((log) => {
              const isOpen = expandedId === log.employee_id;
              const isConfirming = confirmingId === log.employee_id;
              return (
                <div
                  key={log.employee_id}
                  className="rounded-xl border border-white/10 overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedId(isOpen ? null : log.employee_id)
                    }
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-brand-leaf" />
                    <span className="text-sm font-medium text-brand-nightText flex-1 truncate">
                      {log.employees?.name ?? "—"}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-brand-nightText/25 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-white/10 bg-white/[0.035]">
                      <p className="flex items-center gap-1.5 text-xs text-brand-nightText/50 mt-2 mb-3">
                        <Clock size={12} />
                        On duty since {timeStr(log.punch_in)}
                      </p>
                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleForcePunchOut(log.employee_id)}
                            disabled={punchingOutId === log.employee_id}
                            className="flex-1 min-h-[32px] rounded-lg bg-brand-coral text-white text-xs font-semibold disabled:opacity-50"
                          >
                            {punchingOutId === log.employee_id
                              ? "Punching out…"
                              : "Confirm punch out"}
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="min-h-[32px] px-3 rounded-lg border border-white/15 text-brand-nightText/50 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingId(log.employee_id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-brand-nightText/50 hover:text-brand-coral border border-white/15 hover:border-brand-coral/40 rounded-lg px-2.5 py-1.5 transition-colors"
                        >
                          <LogOut size={12} />
                          Punch out
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
