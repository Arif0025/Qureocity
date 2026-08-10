"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Lightweight count-only subscription for tab badges. Kept separate from
// PendingConfirmations (which fetches full rows) since the tab bar needs
// this mounted at all times, not just while that tab is open.
export function usePendingCount() {
  const supabase = createClient();
  const [count, setCount] = useState(0);
  // This hook is called from several components that all mount at once
  // (Sidebar, AdminDashboardV2, EmployeePanel) — a shared, fixed channel
  // name meant every instance after the first tried to attach a new
  // .on() listener to a channel someone else had already called
  // .subscribe() on, which Supabase's realtime client rejects outright.
  // A per-instance name keeps every hook call on its own channel.
  const channelName = useRef(
    `play_sessions_pending_count_${Math.random().toString(36).slice(2)}`,
  );

  const refetch = useCallback(async () => {
    const { count: c } = await supabase
      .from("play_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_payment");
    setCount(c ?? 0);
  }, [supabase]);

  useEffect(() => {
    void refetch();
    const channel = supabase
      .channel(channelName.current)
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
  return count;
}
