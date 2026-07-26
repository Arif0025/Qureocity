"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type SessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  children: { name: string; customers: { name: string } | null } | null;
};

function useTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function statusFor(endTime: string | null): "unlimited" | "green" | "yellow" | "red" {
  if (!endTime) return "unlimited";
  const remainingMs = new Date(endTime).getTime() - Date.now();
  if (remainingMs < 0) return "red";
  if (remainingMs < 15 * 60 * 1000) return "yellow";
  return "green";
}

const styles: Record<string, string> = {
  green: "bg-white border-brand-leaf/30 border-l-4 border-l-brand-leaf",
  yellow: "bg-white border-brand-sun/40 border-l-4 border-l-brand-sun",
  red: "bg-white border-brand-coral/40 border-l-4 border-l-brand-coral",
  unlimited: "bg-white border-brand-sky/30 border-l-4 border-l-brand-sky",
};

const dotStyles: Record<string, string> = {
  green: "bg-brand-leaf",
  yellow: "bg-brand-sun",
  red: "bg-brand-coral",
  unlimited: "bg-brand-sky",
};

export default function LiveFloorView({ initialSessions }: { initialSessions: SessionRow[] }) {
  const supabase = createClient();
  const [sessions, setSessions] = useState<SessionRow[]>(initialSessions);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  useTick(1000); // re-render every second so colors/countdowns stay accurate

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("play_sessions")
      .select("id, start_time, end_time, status, children(name, customers(name))")
      .eq("status", "active")
      .order("end_time", { ascending: true, nullsFirst: false });
    setSessions((data as any) ?? []);
  }, [supabase]);

  const handleCheckout = useCallback(
    async (sessionId: string) => {
      setCheckingOut(sessionId);
      try {
        const { error } = await supabase.rpc("checkout_session", { p_session_id: sessionId });
        if (error) throw error;
        // No manual state removal needed — the Realtime subscription
        // below fires on this UPDATE and refetches the active set.
      } catch (e: any) {
        alert(e.message ?? "Couldn't check out. Please try again.");
      } finally {
        setCheckingOut(null);
      }
    },
    [supabase]
  );

  useEffect(() => {
    // The "active" set is small (partial index keeps it that way), so a
    // full refetch on any change is cheap and far simpler/safer than
    // hand-merging realtime deltas into local state.
    const channel = supabase
      .channel("play_sessions_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "play_sessions" }, refetch)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refetch]);

  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-8 text-center text-brand-ink/40">
        No one's checked in right now.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {sessions.map((s) => {
        const state = statusFor(s.end_time);
        return (
          <div key={s.id} className={`rounded-xl border p-4 ${styles[state]}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${dotStyles[state]}`} />
              <p className="font-semibold text-brand-ink text-sm">{s.children?.name ?? "—"}</p>
            </div>
            <p className="text-xs text-brand-ink/40 mb-3">{s.children?.customers?.name}</p>
            <p className="text-sm font-medium text-brand-ink/70 mb-3">
              {state === "unlimited"
                ? "Unlimited"
                : new Date(s.end_time!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
            <button
              onClick={() => handleCheckout(s.id)}
              disabled={checkingOut === s.id}
              className="w-full min-h-[36px] rounded-lg bg-black/5 hover:bg-black/10 text-brand-ink text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              {checkingOut === s.id ? "Checking out…" : "Check out"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
