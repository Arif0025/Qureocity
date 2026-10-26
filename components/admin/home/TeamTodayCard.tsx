"use client";

import { useState, useCallback, useEffect } from "react";
import { Clock, LogIn, LogOut, Timer } from "lucide-react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";
import { todayISTDateString } from "@/lib/istTime";
import { tapScale } from "@/lib/motion";
import ListRow from "@/components/shared/ListRow";
import NotifyButton from "./NotifyButton";

type TeamMember = {
  employee_id: string;
  employee_name: string;
  role: string;
  status: "present" | "left" | "absent" | "leave";
  leavePayStatus?: "paid" | "unpaid";
  punch_in: string | null;
  punch_out: string | null;
  attendance_log_id: string | null;
  shift_start?: string | null;
};

type DisplayStatus = TeamMember["status"] | "not_started" | "unscheduled";

const displayDot: Record<DisplayStatus, "teamPresent" | "teamLeft" | "teamAbsent" | "teamLeave" | "teamMuted"> = {
  present: "teamPresent",
  left: "teamLeft",
  absent: "teamAbsent",
  leave: "teamLeave",
  not_started: "teamMuted",
  unscheduled: "teamMuted",
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
  const [now, setNow] = useState(() => Date.now());

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc("dashboard_list_team_today");
    if (error) setLoadError(error.message);
    else {
      const today = todayISTDateString();
      const [leaveResult, shiftResult] = await Promise.all([
        supabase
        .from("employee_leave_requests")
        .select("employee_id, paid_dates")
        .eq("status", "approved")
        .lte("start_date", today)
        .gte("end_date", today),
        // The deployed shifts table stores one current shift per employee;
        // it has no shift_date column. Keep the query aligned with ShiftEditor.
        supabase.from("shifts").select("employee_id, start_time"),
      ]);
      if (leaveResult.error || shiftResult.error) {
        setLoadError(leaveResult.error?.message ?? shiftResult.error?.message ?? "Could not load shift schedules.");
        setLoading(false);
        return;
      }
      const leaveByEmployee = new Map((leaveResult.data ?? []).map((row) => [
        row.employee_id as string,
        ((row.paid_dates as string[] | null) ?? []).includes(today) ? "paid" as const : "unpaid" as const,
      ]));
      const shiftByEmployee = new Map((shiftResult.data ?? []).map((row) => [row.employee_id as string, row.start_time as string]));
      setLoadError(null);
      setTeam(((data as TeamMember[]) ?? []).map((member) =>
        ({
          ...member,
          shift_start: shiftByEmployee.get(member.employee_id) ?? null,
          ...(member.status === "absent" && leaveByEmployee.has(member.employee_id)
            ? { status: "leave" as const, leavePayStatus: leaveByEmployee.get(member.employee_id) }
            : {}),
        }),
      ));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    setLoading(true);
    void refetch();
    const channel = supabase
      .channel("team_today_card")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_leave_requests" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, refetch)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, refetch]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const getDisplayStatus = (member: TeamMember): DisplayStatus => {
    if (member.status !== "absent") return member.status;
    if (!member.shift_start) return "unscheduled";
    const start = new Date(`${todayISTDateString()}T${member.shift_start.slice(0, 8)}+05:30`).getTime();
    return Number.isFinite(start) && now < start ? "not_started" : "absent";
  };

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
  const absent = team.filter((member) => getDisplayStatus(member) === "absent").length;
  const onLeave = team.filter((member) => member.status === "leave").length;
  const notStarted = team.filter((member) => getDisplayStatus(member) === "not_started").length;

  return (
    <section className="flex flex-col rounded-2xl border border-white/10 bg-brand-nightSurface">
      <header className="px-5 pb-4 pt-5">
        <p className="font-semibold text-brand-nightText">Team attendance</p>
        <p className="mt-1 text-xs text-brand-nightText/45">
          <span className="text-brand-leaf">{present} present</span>
          <span className="mx-1.5">·</span>
          <span>{left} left</span>
          <span className="mx-1.5">·</span>
          <span className="text-[#ef4444]">{absent} absent</span>
          <span className="mx-1.5">·</span>
          <span className="text-[#a855f7]">{onLeave} on leave</span>
          {notStarted > 0 && <><span className="mx-1.5">·</span><span className="text-brand-nightText/40">{notStarted} shift not started</span></>}
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
          const displayStatus = getDisplayStatus(member);
          return (
            <ListRow
              key={member.employee_id}
              title={member.employee_name}
              subtitle={member.role}
              statusDot={member.status === "leave"
                ? member.leavePayStatus === "paid" ? "teamLeavePaid" : "teamLeaveUnpaid"
                : displayDot[displayStatus]}
              factsLayout="right"
              facts={[{
                value: (
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:text-xs ${
                    displayStatus === "present" ? "border-[#22c55e]/20 bg-[#22c55e]/10 text-[#15130f]" :
                    displayStatus === "left" ? "border-[#facc15]/20 bg-[#facc15]/10 text-[#15130f]" :
                    displayStatus === "leave" ? member.leavePayStatus === "paid" ? "border-[#38bdf8]/20 bg-[#38bdf8]/10 text-[#15130f]" : "border-[#f472b6]/20 bg-[#f472b6]/10 text-[#15130f]" :
                    displayStatus === "absent" ? "border-[#ef4444]/20 bg-[#ef4444]/10 text-[#15130f]" : "border-white/[0.08] bg-white/[0.035] text-[#15130f]"
                  }`}>
                    {displayStatus === "absent"
                      ? "Absent"
                      : displayStatus === "not_started"
                        ? `Shift not started${member.shift_start ? ` · ${member.shift_start.slice(0, 5)}` : ""}`
                      : displayStatus === "unscheduled"
                        ? "No shift today"
                      : displayStatus === "leave"
                        ? member.leavePayStatus === "paid" ? "Paid leave" : "Unpaid leave"
                      : displayStatus === "left"
                        ? member.punch_out ? `Out ${time(member.punch_out)}` : "Left"
                        : member.punch_in ? `In ${time(member.punch_in)}` : "Present"}
                  </span>
                ),
              }]}
              expanded={open}
              onToggleExpand={() => setExpandedId(open ? null : member.employee_id)}
              expandedContent={
                <div className="space-y-1.5 text-xs text-brand-nightText/55">
                  <p className="font-semibold text-brand-nightText/70">{member.status === "leave" ? `On approved ${member.leavePayStatus ?? "unpaid"} leave` : member.status}</p>
                  {member.shift_start && <p className="flex items-center gap-1.5"><Clock size={12} /> Shift starts at {member.shift_start.slice(0, 5)}</p>}
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
