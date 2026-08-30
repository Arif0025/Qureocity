"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronRight, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";
import ListRow from "@/components/shared/ListRow";

type TeamMember = {
  employee_id: string;
  employee_name: string;
  role: string;
  status: "present" | "left" | "absent";
  punch_in: string | null;
  punch_out: string | null;
  attendance_log_id: string | null;
};

function timeStr(v: string) {
  return formatTimeIST(v);
}

const statusDot: Record<TeamMember["status"], "leaf" | "sky" | "muted"> = {
  present: "leaf",
  left: "sky",
  absent: "muted",
};

const statusLabel: Record<TeamMember["status"], string> = {
  present: "Present",
  left: "Left",
  absent: "Absent",
};

const statusPillClass: Record<TeamMember["status"], string> = {
  present: "text-brand-leaf bg-brand-leaf/10",
  left: "text-brand-skyLight bg-brand-sky/10",
  absent: "text-brand-nightText/40 bg-white/5",
};

export default function TeamTodayCard({
  onViewAll,
}: {
  onViewAll: () => void;
}) {
  const [supabase] = useState(() => createClient());
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await supabase.rpc("dashboard_list_team_today");
    setTeam((data as TeamMember[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refetch();
    const channel = supabase
      .channel(`team_today_home_card_${Math.random().toString(36).slice(2)}`)
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

  const presentCount = team.filter((t) => t.status === "present").length;
  const leftCount = team.filter((t) => t.status === "left").length;
  const absentCount = team.filter((t) => t.status === "absent").length;

  return (
    <div className="bg-brand-nightSurface rounded-2xl border border-white/10 flex flex-col h-[440px]">
      <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-4">
        <button onClick={onViewAll} className="flex-1 min-w-0 text-left group">
          <p className="font-semibold text-brand-nightText group-hover:text-brand-sky transition-colors">
            Team today
          </p>
          <p className="text-xs text-brand-nightText/40 mt-0.5">
            {presentCount} present · {leftCount} left · {absentCount} absent
          </p>
        </button>
        <button
          type="button"
          onClick={onViewAll}
          aria-label="View full staff roster"
          className="text-brand-nightText/25 hover:text-brand-sky transition-colors p-0.5 shrink-0"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {loading ? (
          <p className="text-sm text-brand-nightText/35 text-center py-10">
            Loading…
          </p>
        ) : team.length === 0 ? (
          <p className="text-sm text-brand-nightText/35 text-center py-10">
            No staff on record yet.
          </p>
        ) : (
          team.map((t) => (
            <ListRow
              key={t.employee_id}
              accent={t.status === "absent" ? "muted" : "default"}
              title={t.employee_name}
              subtitle={t.role}
              statusDot={statusDot[t.status]}
              facts={
                t.punch_in
                  ? [
                      {
                        icon: <Clock size={11} />,
                        value: t.punch_out
                          ? `${timeStr(t.punch_in)} – ${timeStr(t.punch_out)}`
                          : `Since ${timeStr(t.punch_in)}`,
                      },
                    ]
                  : []
              }
              action={
                <span
                  className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${statusPillClass[t.status]}`}
                >
                  {statusLabel[t.status]}
                </span>
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
