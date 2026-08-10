"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export function usePendingRegistrationsCount() {
  const supabase = createClient();
  const [count, setCount] = useState(0);
  // See usePendingCount.ts for why this needs a per-instance channel
  // name — this hook is also called from multiple simultaneously
  // mounted components.
  const channelName = useRef(
    `membership_registrations_pending_count_${Math.random().toString(36).slice(2)}`,
  );

  const refetch = useCallback(async () => {
    const { count: c } = await supabase
      .from("membership_registrations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    setCount(c ?? 0);
  }, [supabase]);

  useEffect(() => {
    void refetch();
    const channel = supabase
      .channel(channelName.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "membership_registrations" },
        refetch,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refetch]);

  return count;
}
