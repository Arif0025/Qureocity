"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LiveKidsOnSiteChip({
  initialCount,
  onClick,
}: {
  initialCount: number;
  onClick?: () => void;
}) {
  const [supabase] = useState(() => createClient());
  const [count, setCount] = useState(initialCount);

  const refetch = useCallback(async () => {
    const { count: liveCount } = await supabase
      .from("play_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    if (liveCount !== null) setCount(liveCount);
  }, [supabase]);

  useEffect(() => {
    void refetch();
    // A distinct channel name from LiveFloorView's — this stays mounted
    // across every tab (unlike LiveFloorView, which unmounts when you
    // switch away from "On Site"), so it needs its own subscription
    // rather than sharing one that comes and goes.
    const channel = supabase
      .channel("play_sessions_header_chip")
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

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="w-full text-left bg-brand-nightSurface rounded-xl2 border border-white/10 px-4 py-3 hover:border-brand-sky/30 transition-colors disabled:cursor-default disabled:hover:border-white/10"
    >
      <p className="text-xs text-brand-nightText/40">Kids on site</p>
      <p className="text-2xl font-extrabold text-brand-nightText">{count}</p>
    </button>
  );
}
