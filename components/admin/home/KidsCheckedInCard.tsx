"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ChevronRight,
  Phone,
  Heart,
  Hourglass,
  BadgeCheck,
  Timer,
  CalendarDays,
  Clock3,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";
import ListRow from "@/components/shared/ListRow";

export type CheckedInKid = {
  session_id: string;
  child_id: string;
  child_name: string;
  age: number;
  start_time: string;
  end_time: string | null;
  status: string;
  parent_name: string;
  phone: string;
  has_medical_info: boolean;
  visit_type: "membership" | "walk_in" | "special";
  membership_started_on: string | null;
  membership_expires_on: string | null;
  is_membership_expired: boolean;
  plan_name: string | null;
  is_special_today: boolean;
  special_plan_name: string | null;
};

// Kept for backward compatibility with server-rendered initial props —
// the page still passes the old flat session shape on first paint; the
// client refetch upgrades it to CheckedInKid via the new RPC.
export type SessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  children: {
    name: string;
    allergies: string | null;
    medical_conditions: string | null;
    special_instructions: string | null;
    customers: { name: string; phone: string } | null;
  } | null;
};

function hasMedicalInfo(k: Pick<CheckedInKid, "has_medical_info">): boolean {
  return k.has_medical_info;
}

function statusFor(
  endTime: string | null,
  now: number,
): "unlimited" | "ok" | "soon" | "over" {
  if (!endTime) return "unlimited";
  const remainingMs = new Date(endTime).getTime() - now;
  if (remainingMs < 60 * 1000) return "over";
  if (remainingMs <= 20 * 60 * 1000) return "soon";
  return "ok";
}

function CheckoutTimer({ endTime, startTime, now }: { endTime: string | null; startTime: string; now: number }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const remainingMs = endTime ? new Date(endTime).getTime() - now : null;
  const totalMs = endTime ? Math.max(new Date(endTime).getTime() - new Date(startTime).getTime(), 1) : 1;
  const ratio = remainingMs == null ? 1 : Math.max(0, Math.min(1, remainingMs / totalMs));
  const urgent = remainingMs != null && remainingMs < 60_000;
  const soon = remainingMs != null && remainingMs <= 20 * 60_000;
  const tone = remainingMs == null ? "text-brand-skyLight" : urgent ? "text-brand-coral" : soon ? "text-brand-sun" : "text-brand-leaf";
  const lateMinutes = remainingMs != null && remainingMs <= 0 ? Math.max(Math.ceil(Math.abs(remainingMs) / 60_000), 1) : 0;
  const display = remainingMs == null ? "∞" : lateMinutes ? `+${lateMinutes > 99 ? "99+" : lateMinutes}` : remainingMs < 60_000 ? "<1" : String(Math.ceil(remainingMs / 60_000));
  const label = remainingMs == null ? "No scheduled checkout time" : lateMinutes ? `Checkout overdue by ${lateMinutes} minutes` : `Checkout in ${Math.ceil(remainingMs / 60_000)} minutes`;

  return <span title={label} aria-label={label} className={`kids-checkout-timer relative grid h-11 w-11 shrink-0 place-items-center ${tone}`}>
    <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="3.5" />
      <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} className="transition-[stroke-dashoffset] duration-500" />
    </svg>
    <span className="relative flex flex-col items-center leading-none">{remainingMs == null ? <Timer size={16} strokeWidth={2.2} /> : <><span className="font-mono text-[11px] font-bold tabular-nums">{display}</span><span className="mt-0.5 text-[7px] font-semibold uppercase">{lateMinutes ? "late" : "min"}</span></>}</span>
  </span>;
}

const dotFor: Record<string, "leaf" | "sun" | "coral" | "sky"> = {
  ok: "leaf",
  soon: "sun",
  over: "coral",
  unlimited: "sky",
};

function timeStr(v: string) {
  return formatTimeIST(v);
}

function sessionLength(start: string): string {
  const mins = Math.max(
    0,
    Math.round((Date.now() - new Date(start).getTime()) / 60000),
  );
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function KidsCheckedInCard({
  todayCheckinCount,
  venueCapacity,
  onViewAll,
  onOpenCustomerDirectory,
  pendingCount,
  onPendingClick,
  variant = "grid",
}: {
  // Server-provided initial sessions are intentionally not required —
  // this card now owns its own richer fetch via dashboard_list_checked_in_kids.
  initialSessions?: SessionRow[];
  todayCheckinCount?: number;
  venueCapacity: number;
  onViewAll?: () => void;
  onOpenCustomerDirectory: (customerKey: string, childId?: string) => void;
  pendingCount?: number;
  onPendingClick?: () => void;
  /** "grid" (default): fixed height, for sitting side-by-side with
   *  another card (admin dashboard). "full": stretches to fill the
   *  viewport below the header — for when this card IS the page
   *  (employee Home tab), so the bottom of the screen isn't wasted. */
  variant?: "grid" | "full";
}) {
  const [supabase] = useState(() => createClient());
  const [kids, setKids] = useState<CheckedInKid[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const { data } = await supabase.rpc("dashboard_list_checked_in_kids");
    setKids((data as CheckedInKid[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refetch();
    const channel = supabase
      .channel(`play_sessions_home_card_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "play_sessions" },
        refetch,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refetch]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleCheckout = async (sessionId: string) => {
    setCheckingOut(sessionId);
    try {
      const { error } = await supabase.rpc("checkout_session", {
        p_session_id: sessionId,
      });
      if (error) throw error;
    } catch (e: any) {
      alert(e.message ?? "Couldn't check out. Please try again.");
    } finally {
      setCheckingOut(null);
    }
  };

  return (
    <div
      className={`bg-brand-nightSurface rounded-2xl border border-white/10 flex flex-col ${
        variant === "full"
          ? "h-[calc(100dvh-200px)] min-h-[440px]"
          : "max-h-[440px]"
      }`}
    >
      <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-4">
        <div className="flex-1 min-w-0 text-left">
          <p className="font-semibold text-brand-nightText">
            Kids on site
          </p>
          <p className="text-xs text-brand-nightText/40 mt-0.5">
            {kids.length} of {venueCapacity} capacity
            {todayCheckinCount !== undefined && ` · ${todayCheckinCount} check-ins today`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {typeof pendingCount === "number" && pendingCount > 0 && (
            <button
              type="button"
              onClick={onPendingClick}
              className="flex items-center gap-1.5 rounded-full border border-brand-coral/30 bg-brand-coral/10 pl-2 pr-2.5 py-1 text-[11px] font-bold text-brand-coral hover:bg-brand-coral/15 transition-colors"
            >
              <Hourglass size={11} />
              {pendingCount} pending
            </button>
          )}
          {onViewAll && <button
            type="button"
            onClick={onViewAll}
            aria-label="View all checked-in kids"
            className="text-brand-nightText/25 hover:text-brand-sky transition-colors p-0.5"
          >
            <ChevronRight size={18} />
          </button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {loading ? (
          <div className="space-y-2 py-1" aria-label="Loading kids on site">
            {[0, 1, 2].map((row) => <div key={row} className="h-[54px] animate-pulse rounded-xl2 border border-white/5 bg-white/[0.035]" />)}
          </div>
        ) : kids.length === 0 ? (
          <p className="text-sm text-brand-nightText/35 text-center py-10">
            No one&apos;s checked in right now.
          </p>
        ) : (
          kids.map((k) => {
            const state = statusFor(k.end_time, now);
            const isOpen = expandedId === k.session_id;
            return (
              <ListRow
                key={k.session_id}
                title={k.child_name}
                subtitle={`${k.age} ${k.age === 1 ? "year" : "years"} old`}
                statusDot={dotFor[state]}
                safetyFlag={
                  hasMedicalInfo(k) ? (
                    <Heart
                      size={12}
                      className="text-brand-coral shrink-0"
                      fill="currentColor"
                    />
                  ) : k.is_special_today ? (
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-brand-sun bg-brand-sun/10 rounded-full px-1.5 py-0.5 shrink-0">
                      Special
                    </span>
                  ) : undefined
                }
                action={
                  <div className="flex shrink-0 items-center gap-2">
                    <CheckoutTimer endTime={k.end_time} startTime={k.start_time} now={now} />
                    {k.phone ? (
                    <a
                      href={`tel:${k.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Call ${k.parent_name}`}
                      className="shrink-0 p-1.5 rounded-full border border-brand-sky/30 bg-brand-sky/10 text-brand-skyLight hover:bg-brand-sky/15 transition-colors"
                    >
                      <Phone size={12} />
                    </a>
                    ) : null}
                  </div>
                }
                expanded={isOpen}
                onToggleExpand={() =>
                  setExpandedId(isOpen ? null : k.session_id)
                }
                expandedContent={
                  <div className="space-y-2">
                    <div className="rounded-lg border border-white/10 bg-brand-nightSurface2/70 px-2.5 py-2">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-brand-nightText">
                        <BadgeCheck size={13} className="text-brand-skyLight" />
                        {k.visit_type === "special"
                          ? `Special event · ${k.special_plan_name ?? k.plan_name ?? "Pass"}`
                          : k.visit_type === "membership"
                            ? `Membership · ${k.plan_name ?? "Member"}`
                            : `Walk-in visit${k.plan_name ? ` · ${k.plan_name}` : ""}`}
                        {k.is_membership_expired && <span className="rounded-full bg-brand-coral/15 px-2 py-0.5 text-[10px] font-semibold text-brand-coral">Expired</span>}
                      </p>
                      {k.membership_started_on && <p className="mt-1 flex items-center gap-1.5 text-[11px] text-brand-nightText/50"><CalendarDays size={11} className="shrink-0" />{new Date(`${k.membership_started_on}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })} – {k.membership_expires_on ? new Date(`${k.membership_expires_on}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "No expiry"}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg border border-white/10 bg-brand-nightSurface2/70 px-2.5 py-2">
                        <p className="flex items-center gap-1 text-[10px] font-semibold text-brand-nightText/45"><Clock3 size={10} />Check-in</p>
                        <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-brand-nightText">{timeStr(k.start_time)}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-brand-nightSurface2/70 px-2.5 py-2">
                        <p className="flex items-center gap-1 text-[10px] font-semibold text-brand-nightText/45"><Clock3 size={10} />Checkout</p>
                        <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-brand-nightText">{k.end_time ? timeStr(k.end_time) : "No time set"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
                      <UserRound size={13} className="shrink-0 text-brand-nightText/45" />
                      <p className="min-w-0 flex-1 truncate text-xs font-medium text-brand-nightText">{k.parent_name}<span className="font-normal text-brand-nightText/50"> · {k.phone}</span></p>
                      <a href={`tel:${k.phone}`} onClick={(event) => event.stopPropagation()} aria-label={`Call ${k.parent_name}`} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] font-semibold text-brand-nightText"><Phone size={12} />Call</a>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => onOpenCustomerDirectory(k.phone || k.child_name, k.child_id)} className="min-h-9 rounded-lg bg-brand-sky/15 px-2 text-xs font-semibold text-brand-skyLight">View details</button>
                    <button
                      onClick={() => handleCheckout(k.session_id)}
                      disabled={checkingOut === k.session_id}
                      className="min-h-9 rounded-lg bg-brand-sky text-white text-xs font-semibold hover:bg-brand-sky/85 disabled:opacity-50 transition-colors"
                    >
                      {checkingOut === k.session_id ? "Checking out…" : "Check out"}
                    </button>
                    </div>
                  </div>
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}
