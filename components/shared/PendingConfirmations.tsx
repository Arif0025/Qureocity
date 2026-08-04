"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Phone, Clock, Check, X } from "lucide-react";
import { formatTimeIST } from "@/lib/formatTime";

type PendingRow = {
  session_id: string;
  child_id: string;
  child_name: string;
  parent_name: string;
  parent_phone: string;
  start_time: string;
  duration_mins: number | null;
};

// Realtime is for instant cross-device sync of *what's on screen*. The
// actual safety against two staff confirming the same kid at once lives
// in the DB (confirm/discard only succeed if status is still
// pending_payment) — this component just reflects that back to the UI.
export default function PendingConfirmations({
  focusSessionId,
}: {
  focusSessionId?: string | null;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);

  const refetch = useCallback(async () => {
    const { data } = await supabase.rpc("list_pending_sessions");
    setRows((data as PendingRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refetch();
    const channel = supabase
      .channel("play_sessions_pending")
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
    if (focusSessionId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusSessionId, rows]);

  const handle = async (sessionId: string, action: "confirm" | "discard") => {
    setBusyId(sessionId);
    setNotice(null);
    const { data, error } = await supabase.rpc(
      action === "confirm"
        ? "confirm_pending_session"
        : "discard_pending_session",
      { p_session_id: sessionId },
    );
    setBusyId(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    if (data && !(data as any).success) {
      setNotice("Someone else already handled this one.");
      void refetch();
      return;
    }
    // Optimistically drop it locally too — realtime will confirm shortly.
    setRows((prev) => prev.filter((r) => r.session_id !== sessionId));
  };

  if (loading) {
    return (
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-10 text-center text-brand-nightText/40 text-sm">
        Loading…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-10 text-center text-brand-nightText/40 text-sm">
        No pending check-ins right now.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notice && (
        <p className="text-sm text-brand-coral bg-brand-coral/10 border border-brand-coral/30 rounded-xl px-4 py-2.5">
          {notice}
        </p>
      )}
      {rows.map((r) => (
        <div
          key={r.session_id}
          ref={r.session_id === focusSessionId ? focusRef : null}
          className={`bg-brand-nightSurface rounded-xl border overflow-hidden border-l-4 border-l-brand-sun ${
            r.session_id === focusSessionId
              ? "border-brand-sun/60"
              : "border-white/10"
          }`}
        >
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="font-medium text-brand-nightText text-sm truncate">
                {r.child_name}
              </p>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-sun bg-brand-sun/10 rounded-full px-2 py-0.5 shrink-0">
                Awaiting payment
              </span>
            </div>
            <p className="text-xs text-brand-nightText/50 truncate mb-1.5">
              {r.parent_name}
            </p>
            <div className="flex items-center gap-3 text-xs text-brand-nightText/50 mb-3">
              {r.parent_phone && (
                <a
                  href={`tel:${r.parent_phone}`}
                  className="flex items-center gap-1 text-brand-sky hover:underline"
                >
                  <Phone size={12} />
                  {r.parent_phone}
                </a>
              )}
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatTimeIST(r.start_time)}
                {r.duration_mins ? ` · ${r.duration_mins} min` : " · Unlimited"}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handle(r.session_id, "confirm")}
                disabled={busyId === r.session_id}
                className="flex-1 min-h-[36px] flex items-center justify-center gap-1.5 rounded-lg bg-brand-leaf text-white text-xs font-semibold hover:bg-brand-leaf/85 disabled:opacity-50 transition-colors"
              >
                <Check size={14} />
                {busyId === r.session_id ? "Confirming…" : "Confirm payment"}
              </button>
              <button
                onClick={() => handle(r.session_id, "discard")}
                disabled={busyId === r.session_id}
                className="min-h-[36px] flex items-center justify-center gap-1.5 rounded-lg bg-white/8 text-brand-nightText/70 text-xs font-semibold px-3 hover:bg-brand-coral/15 hover:text-brand-coral disabled:opacity-50 transition-colors"
              >
                <X size={14} />
                Not present
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
