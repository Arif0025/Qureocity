"use client";

import { useState, useEffect } from "react";
import {
  UserPlus,
  Sparkles,
  Footprints,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { istDateParts } from "@/lib/formatTime";

type Stats = {
  newCustomers: number;
  newSubscriptions: number;
  walkIns: number;
  memberVisits: number;
  activeMembers: number;
  expiringSoon: number;
};

export default function MonthlyStatsCard() {
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
        { count: totalSessions },
        { data: sessionChildIds },
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
        supabase
          .from("play_sessions")
          .select("id", { count: "exact", head: true })
          .gte("start_time", monthStartISO),
        supabase
          .from("play_sessions")
          .select("child_id")
          .gte("start_time", monthStartISO),
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

      // How many of this month's visits belong to a kid with an active
      // membership vs a pure walk-in — needs a second query since
      // Supabase can't do a "count where related row exists" in one go
      // without a view. Cheap enough at this scale (child ids only).
      let memberVisits = 0;
      const childIds = ((sessionChildIds as { child_id: string }[]) ?? []).map(
        (r) => r.child_id,
      );
      if (childIds.length > 0) {
        const { data: activeSubs } = await supabase
          .from("child_subscriptions")
          .select("child_id")
          .eq("active", true)
          .in("child_id", Array.from(new Set(childIds)));
        const activeIds = new Set(
          ((activeSubs as { child_id: string }[]) ?? []).map((r) => r.child_id),
        );
        memberVisits = childIds.filter((id) => activeIds.has(id)).length;
      }

      setStats({
        newCustomers: customers ?? 0,
        newSubscriptions: subs ?? 0,
        walkIns: totalSessions ?? 0,
        memberVisits,
        activeMembers: activeMembers ?? 0,
        expiringSoon: expiringSoon ?? 0,
      });
    })();
  }, [supabase]);

  const memberSharePct =
    stats && stats.walkIns > 0
      ? Math.round((stats.memberVisits / stats.walkIns) * 100)
      : null;

  return (
    <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-5">
      <p className="font-semibold text-brand-nightText mb-4">
        This month at a glance
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile
          icon={<Footprints size={16} className="text-brand-sky" />}
          value={stats?.walkIns ?? "—"}
          label="Check-ins this month"
          tone="sky"
        />
        <Tile
          icon={<UserPlus size={16} className="text-brand-skyLight" />}
          value={stats?.newCustomers ?? "—"}
          label="New families"
          tone="sky"
        />
        <Tile
          icon={<Sparkles size={16} className="text-brand-sun" />}
          value={stats?.newSubscriptions ?? "—"}
          label="New memberships"
          tone="sun"
        />
        <Tile
          icon={<AlertCircle size={16} className="text-brand-coral" />}
          value={stats?.expiringSoon ?? "—"}
          label="Memberships expiring in 7 days"
          tone="coral"
        />
      </div>

      {stats && stats.activeMembers > 0 && (
        <div className="mt-4 pt-4 border-t border-white/8 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-leaf/15 flex items-center justify-center shrink-0">
            <TrendingUp size={16} className="text-brand-leaf" />
          </div>
          <p className="text-sm text-brand-nightText/60">
            <span className="font-bold text-brand-nightText">
              {stats.activeMembers}
            </span>{" "}
            active memberships
            {memberSharePct !== null && (
              <>
                {" · "}
                <span className="font-bold text-brand-nightText">
                  {memberSharePct}%
                </span>{" "}
                of this month's check-ins were members
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Tile({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone: "sky" | "sun" | "coral";
}) {
  const bg =
    tone === "sky"
      ? "bg-brand-sky/10"
      : tone === "sun"
        ? "bg-brand-sun/10"
        : "bg-brand-coral/10";
  return (
    <div className={`rounded-xl ${bg} border border-white/8 px-3 py-3`}>
      <div className="mb-1.5">{icon}</div>
      <p className="text-xl font-extrabold text-brand-nightText leading-none">
        {value}
      </p>
      <p className="text-[11px] text-brand-nightText/45 mt-1 leading-tight">
        {label}
      </p>
    </div>
  );
}
