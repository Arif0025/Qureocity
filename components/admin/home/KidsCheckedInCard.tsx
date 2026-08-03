"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronRight, Phone, Clock, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";

export type SessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  children: {
    name: string;
    customers: { name: string; phone: string } | null;
  } | null;
};

function statusFor(
  endTime: string | null,
): "unlimited" | "ok" | "soon" | "over" {
  if (!endTime) return "unlimited";
  const remainingMs = new Date(endTime).getTime() - Date.now();
  if (remainingMs < 0) return "over";
  if (remainingMs < 15 * 60 * 1000) return "soon";
  return "ok";
}

const dotStyles: Record<string, string> = {
  ok: "bg-brand-leaf",
  soon: "bg-brand-sun",
  over: "bg-brand-coral",
  unlimited: "bg-brand-sky",
};

function timeStr(v: string) {
  return formatTimeIST(v);
}

export default function KidsCheckedInCard({
  initialSessions,
  todayCheckinCount,
  venueCapacity,
  onViewAll,
  onOpenCustomerDirectory,
}: {
  initialSessions: SessionRow[];
  todayCheckinCount: number;
  venueCapacity: number;
  onViewAll: () => void;
  onOpenCustomerDirectory: (customerKey: string) => void;
}) {
  const supabase = createClient();
  const [sessions, setSessions] = useState(initialSessions ?? []);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("play_sessions")
      .select(
        "id, start_time, end_time, status, children(name, customers(name, phone))",
      )
      .eq("status", "active")
      .order("end_time", { ascending: true, nullsFirst: false });
    setSessions((data as any) ?? []);
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("play_sessions_home_card")
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
    <div className="bg-brand-nightSurface rounded-2xl border border-white/10 flex flex-col h-[420px]">
      <button
        onClick={onViewAll}
        className="flex items-center justify-between px-5 pt-5 pb-4 text-left group"
      >
        <div>
          <p className="font-semibold text-brand-nightText group-hover:text-brand-sky transition-colors">
            Kids checked in
          </p>
          <p className="text-xs text-brand-nightText/40 mt-0.5">
            {sessions.length} of {venueCapacity} capacity · {todayCheckinCount}{" "}
            check-ins today
          </p>
        </div>
        <ChevronRight
          size={18}
          className="text-brand-nightText/25 group-hover:text-brand-sky transition-colors shrink-0"
        />
      </button>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 ? (
          <p className="text-sm text-brand-nightText/35 text-center py-10">
            No one's checked in right now.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sessions.map((s) => {
              const state = statusFor(s.end_time);
              const isOpen = expandedId === s.id;
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-white/10 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(isOpen ? null : s.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStyles[state]}`}
                    />
                    <span className="text-sm font-medium text-brand-nightText flex-1 truncate">
                      {s.children?.name ?? "—"}
                    </span>
                    <span className="text-xs text-brand-nightText/35 shrink-0">
                      {state === "unlimited"
                        ? "Unlimited"
                        : timeStr(s.end_time!)}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-brand-nightText/25 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-white/10 bg-white/[0.035]">
                      <div className="space-y-2 mb-3 mt-2">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenCustomerDirectory(
                              s.children?.customers?.phone ??
                                s.children?.name ??
                                "",
                            )
                          }
                          className="block w-full text-left"
                        >
                          <p className="text-xs text-brand-nightText/50">
                            Child
                          </p>
                          <p className="text-sm font-semibold text-brand-nightText hover:text-brand-sky transition-colors">
                            {s.children?.name ?? "—"}
                          </p>
                        </button>
                        <p className="text-xs text-brand-nightText/50">
                          Parent:{" "}
                          <span className="text-brand-nightText font-medium">
                            {s.children?.customers?.name ?? "—"}
                          </span>
                        </p>
                        {s.children?.customers?.phone && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-brand-nightText/50">
                              {s.children.customers.phone}
                            </span>
                            <a
                              href={`tel:${s.children.customers.phone}`}
                              className="inline-flex items-center gap-1 rounded-full border border-brand-sky/30 bg-brand-sky/10 px-2.5 py-1 text-[11px] font-semibold text-brand-skyLight hover:bg-brand-sky/15 transition-colors"
                            >
                              <Phone size={11} />
                              Call
                            </a>
                          </div>
                        )}
                        <p className="flex items-center gap-1.5 text-xs text-brand-nightText/50">
                          <Clock size={12} />
                          Checked in {timeStr(s.start_time)}
                          {state !== "unlimited" &&
                            ` · checkout by ${timeStr(s.end_time!)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCheckout(s.id)}
                        disabled={checkingOut === s.id}
                        className="w-full min-h-[34px] rounded-lg bg-brand-sky text-white text-xs font-semibold hover:bg-brand-sky/85 disabled:opacity-50 transition-colors"
                      >
                        {checkingOut === s.id ? "Checking out…" : "Check out"}
                      </button>
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
