"use client";

import { useState, useCallback, useEffect } from "react";
import { Clock, LogIn, LogOut, Timer } from "lucide-react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";
import { tapScale } from "@/lib/motion";
import ListRow from "@/components/shared/ListRow";
import NotifyButton from "./NotifyButton";

type TeamMember = {
  employee_id: string;
  employee_name: string;
  role: string;
  status: "present" | "left" | "absent";
  punch_in: string | null;
  punch_out: string | null;
  attendance_log_id: string | null;
};

const statusDot: Record<TeamMember["status"], "teamPresent" | "sky" | "teamMuted"> = {
  present: "teamPresent",
  left: "sky",
  absent: "teamMuted",
};

function time(value: string) {
  return formatTimeIST(value);
}

function duration(start: string, end: string | null) {
  const minutes = Math.max(0, Math.floor((new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export default function TeamTodayCard() {
  const [supabase] = useState(() => createClient());
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc("dashboard_list_team_today");
    if (error) setLoadError(error.message);
    else {
      setLoadError(null);
      setTeam((data as TeamMember[]) ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    setLoading(true);
    void refetch();
    const channel = supabase
      .channel("team_today_card")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, refetch)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, refetch]);

  const forcePunch = async (member: TeamMember) => {
    setActingId(member.employee_id);
    const { error } = await supabase.rpc(
      member.status === "present" ? "admin_force_punch_out" : "admin_force_punch_in",
      { p_employee_id: member.employee_id },
    );
    setActingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    await refetch();
  };

  const present = team.filter((member) => member.status === "present").length;
  const left = team.filter((member) => member.status === "left").length;
  const absent = team.filter((member) => member.status === "absent").length;

  return (
    <section className="flex flex-col rounded-2xl border border-white/10 bg-brand-nightSurface">
      <header className="px-5 pb-4 pt-5">
        <p className="font-semibold text-brand-nightText">Team attendance</p>
        <p className="mt-1 text-xs text-brand-nightText/45">
          <span className="text-brand-leaf">{present} present</span>
          <span className="mx-1.5">·</span>
          <span>{left} left</span>
          <span className="mx-1.5">·</span>
          <span>{absent} absent</span>
        </p>
      </header>

      <div className="space-y-1.5 px-3 pb-4">
        {loading ? (
          <div className="space-y-2 py-1" aria-label="Loading team attendance">
            {[0, 1, 2].map((row) => <div key={row} className="h-[54px] animate-pulse rounded-xl2 border border-white/5 bg-white/[0.035]" />)}
          </div>
        ) : loadError ? (
          <p role="alert" className="rounded-xl border border-brand-coral/20 bg-brand-coral/5 px-3 py-4 text-xs text-brand-coral">Could not load team attendance: {loadError}</p>
        ) : team.length === 0 ? (
          <p className="py-10 text-center text-sm text-brand-nightText/40">No staff on the roster.</p>
        ) : team.map((member) => {
          const open = expandedId === member.employee_id;
          return (
            <ListRow
              key={member.employee_id}
              title={member.employee_name}
              subtitle={member.role}
              statusDot={statusDot[member.status]}
              factsLayout="right"
              facts={[{
                value: (
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold sm:text-xs ${
                    member.status === "present" ? "bg-brand-leaf/10 text-brand-leaf" :
                    member.status === "left" ? "bg-brand-sky/10 text-brand-skyLight" :
                    "bg-white/[0.06] text-brand-nightText/45"
                  }`}>
                    {member.status === "absent"
                      ? "Absent"
                      : member.status === "left"
                        ? member.punch_out ? `Out ${time(member.punch_out)}` : "Left"
                        : member.punch_in ? `In ${time(member.punch_in)}` : "Present"}
                  </span>
                ),
              }]}
              expanded={open}
              onToggleExpand={() => setExpandedId(open ? null : member.employee_id)}
              expandedContent={
                <div className="space-y-1.5 text-xs text-brand-nightText/55">
                  <p className="font-semibold capitalize text-brand-nightText/70">{member.status}</p>
                  {member.punch_in ? <>
                    <p className="flex items-center gap-1.5"><Clock size={12} /> Punched in {time(member.punch_in)}</p>
                    {member.punch_out && <p className="flex items-center gap-1.5"><Clock size={12} /> Punched out {time(member.punch_out)}</p>}
                    <p className="flex items-center gap-1.5"><Timer size={12} /> Worked {duration(member.punch_in, member.punch_out)}</p>
                  </> : <p>No punch record for this date.</p>}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <NotifyButton employeeId={member.employee_id} employeeName={member.employee_name} />
                    <motion.button type="button" whileTap={tapScale} onClick={() => void forcePunch(member)} disabled={actingId === member.employee_id}
                      aria-label={`${member.status === "present" ? "Punch out" : "Punch in"} ${member.employee_name}`}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${member.status === "present" ? "border-brand-coral/20 bg-brand-coral/10 text-brand-coral" : "border-brand-leaf/20 bg-brand-leaf/10 text-brand-leaf"}`}>
                      {member.status === "present" ? <LogOut size={14} /> : <LogIn size={14} />}
                      {actingId === member.employee_id ? "Saving…" : member.status === "present" ? "Punch out" : "Punch in"}
                    </motion.button>
                  </div>
                </div>
              }
            />
          );
        })}
      </div>
    </section>
  );
}
