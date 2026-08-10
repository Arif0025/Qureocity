"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, Phone, Clock, Heart } from "lucide-react";
import { formatTimeIST } from "@/lib/formatTime";

type SessionRow = {
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

function hasMedicalInfo(c: SessionRow["children"]): boolean {
  return !!(c?.allergies || c?.medical_conditions || c?.special_instructions);
}

function useTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function statusFor(
  endTime: string | null,
): "unlimited" | "green" | "yellow" | "red" {
  if (!endTime) return "unlimited";
  const remainingMs = new Date(endTime).getTime() - Date.now();
  if (remainingMs < 0) return "red";
  if (remainingMs < 15 * 60 * 1000) return "yellow";
  return "green";
}

const borderStyles: Record<string, string> = {
  green: "border-l-brand-leaf",
  yellow: "border-l-brand-sun",
  red: "border-l-brand-coral",
  unlimited: "border-l-brand-sky",
};

const dotStyles: Record<string, string> = {
  green: "bg-brand-leaf",
  yellow: "bg-brand-sun",
  red: "bg-brand-coral",
  unlimited: "bg-brand-sky",
};

function timeStr(v: string) {
  return formatTimeIST(v);
}

export default function LiveFloorView({
  initialSessions,
  onPendingClick,
}: {
  initialSessions: SessionRow[];
  // Pending rows aren't actionable from here — tapping one hands off to
  // the Pending Confirmations tab instead of expanding a dropdown, since
  // confirm/discard needs to be a deliberate action, not one tap away in
  // a quick-glance row meant for calling a parent.
  onPendingClick?: (sessionId: string) => void;
}) {
  const [supabase] = useState(() => createClient());
  const [sessions, setSessions] = useState<SessionRow[]>(initialSessions ?? []);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useTick(1000); // re-render every second so colors/countdowns stay accurate

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("play_sessions")
      .select(
        "id, start_time, end_time, status, children(name, allergies, medical_conditions, special_instructions, customers(name, phone))",
      )
      .in("status", ["active", "pending_payment"])
      .order("end_time", { ascending: true, nullsFirst: false });
    setSessions((data as any) ?? []);
  }, [supabase]);

  const handleCheckout = useCallback(
    async (sessionId: string) => {
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
    },
    [supabase],
  );

  useEffect(() => {
    // This component is unmounted/remounted on every tab switch, so
    // `initialSessions` (a one-time snapshot from page load) can be
    // stale by the time it remounts — always refetch immediately rather
    // than waiting for the next realtime event to happen to fire.
    void refetch();

    // The "active" set is small (partial index keeps it that way), so a
    // full refetch on any change is cheap and far simpler/safer than
    // hand-merging realtime deltas into local state.
    const channel = supabase
      .channel("play_sessions_admin")
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

  if (sessions.length === 0) {
    return (
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-10 text-center text-brand-nightText/40 text-sm">
        No one's checked in right now.
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
      {sessions.map((s) => {
        const isPending = s.status === "pending_payment";
        const state = statusFor(s.end_time);
        const isOpen = expandedId === s.id;

        if (isPending) {
          return (
            <button
              key={s.id}
              onClick={() => onPendingClick?.(s.id)}
              className="w-full text-left bg-brand-nightSurface rounded-xl border border-white/[0.1] border-l-4 border-l-brand-sun overflow-hidden"
            >
              <div className="flex items-center gap-2.5 px-4 py-3.5">
                <span className="w-2 h-2 rounded-full shrink-0 bg-brand-sun" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-brand-nightText text-sm truncate">
                    {s.children?.name ?? "—"}
                  </p>
                  <p className="text-xs text-brand-nightText/40 truncate">
                    {s.children?.customers?.name}
                  </p>
                </div>
                {hasMedicalInfo(s.children) && (
                  <Heart
                    size={13}
                    className="text-brand-coral shrink-0"
                    fill="currentColor"
                  />
                )}
                <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-sun bg-brand-sun/10 rounded-full px-2 py-0.5 shrink-0">
                  Awaiting payment
                </span>
              </div>
            </button>
          );
        }

        return (
          <div
            key={s.id}
            className={`bg-brand-nightSurface rounded-xl border border-white/[0.1] border-l-4 overflow-hidden ${borderStyles[state]}`}
          >
            <button
              onClick={() => setExpandedId(isOpen ? null : s.id)}
              className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left"
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${dotStyles[state]}`}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-brand-nightText text-sm truncate">
                  {s.children?.name ?? "—"}
                </p>
                <p className="text-xs text-brand-nightText/40 truncate">
                  {s.children?.customers?.name}
                </p>
              </div>
              {hasMedicalInfo(s.children) && (
                <Heart
                  size={13}
                  className="text-brand-coral shrink-0"
                  fill="currentColor"
                />
              )}
              <span className="text-xs font-medium text-brand-nightText/50 shrink-0">
                {state === "unlimited" ? "Unlimited" : timeStr(s.end_time!)}
              </span>
              <ChevronDown
                size={14}
                className={`text-brand-nightText/25 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-white/10 bg-white/[0.035]">
                <div className="space-y-1.5 my-2.5">
                  {s.children?.customers?.phone && (
                    <a
                      href={`tel:${s.children.customers.phone}`}
                      className="flex items-center gap-1.5 text-xs text-brand-sky hover:underline w-fit"
                    >
                      <Phone size={12} />
                      {s.children.customers.phone}
                    </a>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-brand-nightText/50">
                    <Clock size={12} />
                    Checked in {timeStr(s.start_time)}
                    {state !== "unlimited" &&
                      ` · checkout by ${timeStr(s.end_time!)}`}
                  </p>
                </div>
                {hasMedicalInfo(s.children) && (
                  <div className="rounded-lg bg-brand-coral/8 border border-brand-coral/20 px-3 py-2 mb-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-coral uppercase tracking-wide mb-1">
                      <Heart size={11} fill="currentColor" /> Medical
                    </p>
                    {s.children?.allergies && (
                      <p className="text-xs text-brand-nightText/70">
                        Allergies: {s.children.allergies}
                      </p>
                    )}
                    {s.children?.medical_conditions && (
                      <p className="text-xs text-brand-nightText/70">
                        Conditions: {s.children.medical_conditions}
                      </p>
                    )}
                    {s.children?.special_instructions && (
                      <p className="text-xs text-brand-nightText/70">
                        Notes: {s.children.special_instructions}
                      </p>
                    )}
                  </div>
                )}
                <button
                  onClick={() => handleCheckout(s.id)}
                  disabled={checkingOut === s.id}
                  className="w-full min-h-[36px] rounded-lg bg-brand-sky text-white text-xs font-semibold hover:bg-brand-sky/85 disabled:opacity-50 transition-colors"
                >
                  {checkingOut === s.id ? "Checking out…" : "Check out"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
