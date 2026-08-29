"use client";

import { useState, useEffect } from "react";
import { PartyPopper, Calendar, Users, Link as LinkIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SpecialDay = {
  plan_id: string;
  plan_name: string;
  code: string | null;
  event_date: string;
  member_count: number;
};

function formatEventDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function SpecialDaysCard({
  onOpenPlans,
  onOpenDay,
}: {
  onOpenPlans?: () => void;
  onOpenDay?: (planId: string) => void;
}) {
  const supabase = createClient();
  const [days, setDays] = useState<SpecialDay[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: plans }, { data: members }] = await Promise.all([
        supabase
          .from("membership_plans")
          .select("id, name, code, event_date")
          .eq("plan_type", "special")
          .eq("active", true)
          .gte("event_date", today)
          .order("event_date", { ascending: true })
          .limit(6),
        supabase.rpc("admin_list_plan_members"),
      ]);
      const countByPlan: Record<string, number> = {};
      for (const row of members ?? []) {
        countByPlan[row.plan_id] = row.member_count ?? 0;
      }
      setDays(
        (plans ?? []).map((p: any) => ({
          plan_id: p.id,
          plan_name: p.name,
          code: p.code,
          event_date: p.event_date,
          member_count: countByPlan[p.id] ?? 0,
        })),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nothing scheduled — don't clutter the dashboard with an empty card.
  if (days !== null && days.length === 0) return null;

  return (
    <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PartyPopper size={17} className="text-brand-coral" />
          <p className="font-semibold text-brand-nightText">
            Upcoming special days
          </p>
        </div>
        {onOpenPlans && (
          <button
            onClick={onOpenPlans}
            className="text-xs font-semibold text-brand-sky hover:underline"
          >
            Manage plans
          </button>
        )}
      </div>

      {days === null ? (
        <p className="text-xs text-brand-nightText/35 py-2">Loading…</p>
      ) : (
        <div className="space-y-2">
          {days.map((d) => (
            <div
              key={d.plan_id}
              role={onOpenDay ? "button" : undefined}
              tabIndex={onOpenDay ? 0 : undefined}
              onClick={() => onOpenDay?.(d.plan_id)}
              className={`flex items-center justify-between gap-3 rounded-xl bg-brand-nightSurface2 px-3.5 py-3 ${
                onOpenDay
                  ? "cursor-pointer hover:bg-white/[0.06] transition-colors"
                  : ""
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand-nightText truncate">
                  {d.plan_name}
                </p>
                <p className="text-xs text-brand-nightText/40 flex items-center gap-1.5 mt-0.5">
                  <Calendar size={11} /> {formatEventDate(d.event_date)}
                  <span className="text-brand-nightText/25">·</span>
                  <Users size={11} /> {d.member_count} registered
                </p>
              </div>
              {d.code && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = `${window.location.origin}/checkin/special/${d.code!.toLowerCase()}`;
                    navigator.clipboard?.writeText(url);
                    setCopiedId(d.plan_id);
                    setTimeout(() => setCopiedId(null), 1500);
                  }}
                  className="shrink-0 text-[11px] font-semibold text-brand-nightText/40 hover:text-brand-sky flex items-center gap-1"
                >
                  <LinkIcon size={11} />
                  {copiedId === d.plan_id ? "Copied!" : "Copy link"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
