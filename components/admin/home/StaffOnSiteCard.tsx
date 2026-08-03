"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronRight, ChevronDown, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";

type OnDutyLog = {
  employee_id: string;
  punch_in: string;
  employees: { name: string } | null;
};

function timeStr(v: string) {
  return formatTimeIST(v);
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
  const supabase = createClient();
  const [onDutyStaff, setOnDutyStaff] = useState(initialOnDutyStaff ?? []);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("attendance_logs")
      .select("employee_id, punch_in, employees(name)")
      .is("punch_out", null);
    setOnDutyStaff((data as any) ?? []);
  }, [supabase]);

  useEffect(() => {
    // Punching in/out writes to attendance_logs — subscribing here means
    // this card (and its "on duty" count) updates the instant a punch
    // happens, with no page reload needed.
    const channel = supabase
      .channel("attendance_logs_home_card")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_logs" },
        refetch,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refetch]);

  return (
    <div className="bg-brand-nightSurface rounded-2xl border border-white/10 flex flex-col h-[420px]">
      <button
        onClick={onViewAll}
        className="flex items-center justify-between px-5 pt-5 pb-4 text-left group"
      >
        <div>
          <p className="font-semibold text-brand-nightText group-hover:text-brand-sky transition-colors">
            Staff on site
          </p>
          <p className="text-xs text-brand-nightText/40 mt-0.5">
            {onDutyStaff.length} on duty · {totalStaff} on the roster
          </p>
        </div>
        <ChevronRight
          size={18}
          className="text-brand-nightText/25 group-hover:text-brand-sky transition-colors shrink-0"
        />
      </button>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {onDutyStaff.length === 0 ? (
          <p className="text-sm text-brand-nightText/35 text-center py-10">
            No one is currently punched in.
          </p>
        ) : (
          <div className="space-y-1.5">
            {onDutyStaff.map((log) => {
              const isOpen = expandedId === log.employee_id;
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
                      <p className="flex items-center gap-1.5 text-xs text-brand-nightText/50 mt-2">
                        <Clock size={12} />
                        On duty since {timeStr(log.punch_in)}
                      </p>
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
