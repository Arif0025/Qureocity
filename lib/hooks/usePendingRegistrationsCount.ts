"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { createClient } from "@/lib/supabase/client";

export function usePendingRegistrationsCount(onNewRegistration?: () => void) {
  const supabase = createClient();
  const [counts, setCounts] = useState({ registrations: 0, parties: 0, leaves: 0 });
  // See usePendingCount.ts for why this needs a per-instance channel
  // name — this hook is also called from multiple simultaneously
  // mounted components.
  const instanceId = useId().replace(/:/g, "");
  const channelName = useRef(`membership_registrations_pending_count_${instanceId}`);

  const refreshRegistrations = useCallback(async () => {
    const { count: total } = await supabase.from("membership_registrations").select("id", { count: "exact", head: true }).eq("status", "pending");
    setCounts((current) => ({ ...current, registrations: total ?? 0 }));
  }, [supabase]);
  const refreshParties = useCallback(async () => {
    const { count: total } = await supabase.from("party_bookings").select("id", { count: "exact", head: true }).eq("status", "pending");
    setCounts((current) => ({ ...current, parties: total ?? 0 }));
  }, [supabase]);
  const refreshLeaves = useCallback(async () => {
    const { count: total } = await supabase.from("employee_leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
    setCounts((current) => ({ ...current, leaves: total ?? 0 }));
  }, [supabase]);

  useEffect(() => {
    void refreshRegistrations();
    void refreshParties();
    void refreshLeaves();
    const channel = supabase
      .channel(channelName.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "membership_registrations" },
        (payload) => {
          void refreshRegistrations();
          if (payload.eventType === "INSERT") onNewRegistration?.();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "party_bookings" },
        refreshParties,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_leave_requests" },
        refreshLeaves,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refreshRegistrations, refreshParties, refreshLeaves, onNewRegistration]);

  return counts.registrations + counts.parties + counts.leaves;
}
