"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

// Lightweight count-only subscription for tab badges. Kept separate from
// PendingConfirmations (which fetches full rows) since the tab bar needs
// this mounted at all times, not just while that tab is open.
export function usePendingCount() {
  const supabase = createClient();
  const [count, setCount] = useState(0);

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
      .channel("play_sessions_pending_count")
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
