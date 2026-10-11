"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { createClient } from "@/lib/supabase/client";

export function usePendingRegistrationsCount() {
  const supabase = createClient();
  const [count, setCount] = useState(0);
  // See usePendingCount.ts for why this needs a per-instance channel
  // name — this hook is also called from multiple simultaneously
  // mounted components.
  const instanceId = useId().replaceAll(":", "");
  const channelName = useRef(`membership_registrations_pending_count_${instanceId}`);

  const refetch = useCallback(async () => {
    const [registrations, parties] = await Promise.all([
      supabase.from("membership_registrations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("party_bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    setCount((registrations.count ?? 0) + (parties.count ?? 0));
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "party_bookings" },
        refetch,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refetch]);

  return count;
}
