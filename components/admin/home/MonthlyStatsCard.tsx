"use client";

import { useState, useEffect } from "react";
import {
  UserPlus,
  Sparkles,
  Footprints,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { istDateParts } from "@/lib/formatTime";

type Stats = {
  newCustomers: number;
  newSubscriptions: number;
  walkIns: number;
  memberVisits: number;
  specialVisits: number;
  totalVisits: number;
  activeMembers: number;
  expiringSoon: number;
};

export default function MonthlyStatsCard({
  onActivityClick,
  onNewFamiliesClick,
  onNewMembershipsClick,
  onExpiringClick,
}: {
  onActivityClick?: () => void;
  onNewFamiliesClick?: () => void;
  onNewMembershipsClick?: () => void;
  onExpiringClick?: () => void;
}) {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const { year, month } = istDateParts(new Date().toISOString());
      const monthStartISO = new Date(
        Date.UTC(year, month, 1, 0, 0, 0) - 5.5 * 3600_000,
      ).toISOString();
      const monthStartDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const today = `${year}-${String(month + 1).padStart(2, "0")}-${String(istDateParts(new Date().toISOString()).date).padStart(2, "0")}`;
      const sevenDaysOut = new Date(
        Date.UTC(year, month, istDateParts(new Date().toISOString()).date + 7),
      )
        .toISOString()
        .slice(0, 10);

      const [
        { count: customers },
        { count: subs },
        { data: typeSummary },
        { count: activeMembers },
        { count: expiringSoon },
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .gte("created_at", monthStartISO),
        supabase
          .from("child_subscriptions")
          .select("child_id", { count: "exact", head: true })
          .gte("started_on", monthStartDate),
        // Single accurate split (0073): confirmed visits only, and a
        // membership visit is one where the child's plan window actually
        // covered that day — not just "has an active subscription now".
        supabase.rpc("checkin_type_summary", {
          p_since: monthStartISO,
        }),
        supabase
          .from("child_subscriptions")
          .select("child_id", { count: "exact", head: true })
          .eq("active", true)
          .gte("expires_on", today),
        supabase
          .from("child_subscriptions")
          .select("child_id", { count: "exact", head: true })
          .eq("active", true)
          .gte("expires_on", today)
          .lte("expires_on", sevenDaysOut),
      ]);

      const byType = new Map(
        ((typeSummary as { visit_type: string; cnt: number }[]) ?? []).map(
          (r) => [r.visit_type, r.cnt],
        ),
      );
      const walkIns = byType.get("walk_in") ?? 0;
      const memberVisits = byType.get("membership") ?? 0;
      const specialVisits = byType.get("special") ?? 0;

      setStats({
        newCustomers: customers ?? 0,
        newSubscriptions: subs ?? 0,
        walkIns,
        memberVisits,
        specialVisits,
        totalVisits: walkIns + memberVisits + specialVisits,
        activeMembers: activeMembers ?? 0,
        expiringSoon: expiringSoon ?? 0,
      });
    })();
  }, [supabase]);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-brand-nightSurface">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-nightText/40">Monthly overview</p>
          <h2 className="mt-1 font-semibold text-brand-nightText">This month at a glance</h2>
        </div>
        <button type="button" onClick={onActivityClick} disabled={!onActivityClick}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-brand-sky/20 bg-brand-sky/10 px-3 py-2 text-xs font-semibold text-brand-skyLight transition-colors hover:bg-brand-sky/15 disabled:cursor-default">
          <CalendarDays size={14} /> <span className="hidden sm:inline">Check-in activity</span><span className="sm:hidden">Activity</span><ArrowUpRight size={13} />
        </button>
      </header>
      <div className="p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <Tile
          icon={<Footprints size={16} className="text-brand-sky" />}
          value={stats?.walkIns ?? "—"}
          label="Walk-ins this month"
        />
        <Tile
          icon={<UserPlus size={16} className="text-brand-skyLight" />}
          value={stats?.newCustomers ?? "—"}
          label="New families"
          onClick={onNewFamiliesClick}
        />
        <Tile
          icon={<Sparkles size={16} className="text-brand-sun" />}
          value={stats?.newSubscriptions ?? "—"}
          label="New memberships"
          onClick={onNewMembershipsClick}
        />
        <Tile
          icon={<AlertCircle size={16} className="text-brand-coral" />}
          value={stats?.expiringSoon ?? "—"}
          label="Memberships expiring in 7 days"
          onClick={onExpiringClick}
        />
      </div>

      {stats && <div className="mt-3 flex items-center gap-2 border-t border-white/[0.07] pt-3 text-xs text-brand-nightText/55">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-leaf/10"><TrendingUp size={14} className="text-brand-leaf" /></span>
        <span><strong className="font-semibold text-brand-nightText">{stats.activeMembers}</strong> active memberships</span>
        <span className="ml-auto text-brand-nightText/35">{stats.totalVisits} check-ins</span>
      </div>}
      </div>
    </section>
  );
}

function Tile({
  icon,
  value,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`min-h-[92px] rounded-xl border border-transparent bg-transparent px-3 py-3 text-left transition-colors ${onClick ? "cursor-pointer hover:border-brand-sky/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky/50" : "cursor-default"}`}
    >
      <div className="mb-1.5">{icon}</div>
      <p className="text-xl font-extrabold text-brand-nightText leading-none">
        {value}
      </p>
      <p className="text-[11px] text-brand-nightText/45 mt-1 leading-tight">
        {label}
      </p>
    </button>
  );
}
