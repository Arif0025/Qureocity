"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ChevronRight,
  Phone,
  Clock,
  Heart,
  Hourglass,
  BadgeCheck,
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
  allergies: string | null;
  medical_conditions: string | null;
  special_instructions: string | null;
  is_member: boolean;
  plan_name: string | null;
  is_special_today: boolean;
  special_plan_name: string | null;
  receipt_number: string | null;
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

function hasMedicalInfo(
  k: Pick<
    CheckedInKid,
    "allergies" | "medical_conditions" | "special_instructions"
  >,
): boolean {
  return !!(k.allergies || k.medical_conditions || k.special_instructions);
}

function statusFor(
  endTime: string | null,
): "unlimited" | "ok" | "soon" | "over" {
  if (!endTime) return "unlimited";
  const remainingMs = new Date(endTime).getTime() - Date.now();
  if (remainingMs < 0) return "over";
  if (remainingMs < 15 * 60 * 1000) return "soon";
  return "ok";
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
  todayCheckinCount: number;
  venueCapacity: number;
  onViewAll: () => void;
  onOpenCustomerDirectory: (customerKey: string) => void;
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const { data } = await supabase.rpc("dashboard_list_checked_in_kids");
    setKids((data as CheckedInKid[]) ?? []);
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
        <button onClick={onViewAll} className="flex-1 min-w-0 text-left group">
          <p className="font-semibold text-brand-nightText group-hover:text-brand-sky transition-colors">
            Kids on site
          </p>
          <p className="text-xs text-brand-nightText/40 mt-0.5">
            {kids.length} of {venueCapacity} capacity · {todayCheckinCount}{" "}
            check-ins today
          </p>
        </button>
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
          <button
            type="button"
            onClick={onViewAll}
            aria-label="View all checked-in kids"
            className="text-brand-nightText/25 hover:text-brand-sky transition-colors p-0.5"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {kids.length === 0 ? (
          <p className="text-sm text-brand-nightText/35 text-center py-10">
            No one's checked in right now.
          </p>
        ) : (
          kids.map((k) => {
            const state = statusFor(k.end_time);
            const isOpen = expandedId === k.session_id;
            return (
              <ListRow
                key={k.session_id}
                title={k.child_name}
                subtitle={`${k.age}y`}
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
                facts={[
                  { icon: <Clock size={11} />, value: timeStr(k.start_time) },
                  {
                    icon: <Hourglass size={11} />,
                    value: sessionLength(k.start_time),
                    hideOnMobile: true,
                  },
                ]}
                action={
                  k.phone ? (
                    <a
                      href={`tel:${k.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Call ${k.parent_name}`}
                      className="shrink-0 p-1.5 rounded-full border border-brand-sky/30 bg-brand-sky/10 text-brand-skyLight hover:bg-brand-sky/15 transition-colors"
                    >
                      <Phone size={12} />
                    </a>
                  ) : undefined
                }
                expanded={isOpen}
                onToggleExpand={() =>
                  setExpandedId(isOpen ? null : k.session_id)
                }
                expandedContent={
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenCustomerDirectory(k.phone || k.child_name)
                      }
                      className="block text-left"
                    >
                      <p className="text-xs text-brand-nightText/50">Parent</p>
                      <p className="text-sm font-semibold text-brand-nightText hover:text-brand-sky transition-colors">
                        {k.parent_name} · {k.phone}
                      </p>
                    </button>

                    <p className="flex items-center gap-1.5 text-xs text-brand-nightText/50">
                      <BadgeCheck size={12} />
                      {k.is_member
                        ? `Member · ${k.plan_name ?? "Active plan"}`
                        : "Not a member"}
                      {k.is_special_today && k.special_plan_name && (
                        <span className="text-brand-sun">
                          {" "}
                          · {k.special_plan_name} today
                        </span>
                      )}
                    </p>

                    {k.receipt_number && (
                      <p className="text-xs text-brand-nightText/50">
                        Receipt:{" "}
                        <span className="text-brand-nightText font-medium">
                          {k.receipt_number}
                        </span>
                      </p>
                    )}

                    {hasMedicalInfo(k) && (
                      <div className="rounded-lg bg-brand-coral/8 border border-brand-coral/20 px-3 py-2">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-coral uppercase tracking-wide mb-1">
                          <Heart size={11} fill="currentColor" /> Medical
                        </p>
                        {k.allergies && (
                          <p className="text-xs text-brand-nightText/70">
                            Allergies: {k.allergies}
                          </p>
                        )}
                        {k.medical_conditions && (
                          <p className="text-xs text-brand-nightText/70">
                            Conditions: {k.medical_conditions}
                          </p>
                        )}
                        {k.special_instructions && (
                          <p className="text-xs text-brand-nightText/70">
                            Notes: {k.special_instructions}
                          </p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => handleCheckout(k.session_id)}
                      disabled={checkingOut === k.session_id}
                      className="w-full min-h-[34px] rounded-lg bg-brand-sky text-white text-xs font-semibold hover:bg-brand-sky/85 disabled:opacity-50 transition-colors"
                    >
                      {checkingOut === k.session_id
                        ? "Checking out…"
                        : "Check out"}
                    </button>
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
