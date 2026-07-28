"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";

type Result = {
  child_id: string;
  child_name: string;
  age: number;
  customer_id: string;
  parent_name: string;
  phone_last4: string;
  currently_checked_in: boolean;
  active_session_id: string | null;
};

export default function QuickCheckin() {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyChildId, setBusyChildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc(
        "checkin_search_active_subscribers",
        {
          p_query: query.trim(),
        },
      );
      setLoading(false);
      if (!error) setResults((data as Result[]) ?? []);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, supabase]);

  const refreshOne = async (childId: string) => {
    const { data } = await supabase.rpc("checkin_search_active_subscribers", {
      p_query: query.trim(),
    });
    setResults((data as Result[]) ?? []);
  };

  const handleCheckIn = async (r: Result, durationMins: number | null) => {
    setBusyChildId(r.child_id);
    setError(null);
    const { error } = await supabase.rpc("checkin_create_sessions", {
      p_customer_id: r.customer_id,
      p_child_ids: [r.child_id],
      p_duration_mins: durationMins,
      p_client_key: getClientKey(),
    });
    setBusyChildId(null);
    if (error) return setError(error.message);
    refreshOne(r.child_id);
  };

  const handleCheckOut = async (r: Result) => {
    if (!r.active_session_id) return;
    setBusyChildId(r.child_id);
    setError(null);
    const { error } = await supabase.rpc("checkout_session", {
      p_session_id: r.active_session_id,
    });
    setBusyChildId(null);
    if (error) return setError(error.message);
    refreshOne(r.child_id);
  };

  return (
    <div>
      <div className="bg-brand-sun/10 border border-brand-sun/30 rounded-xl2 px-4 py-3 mb-4 text-sm text-brand-ink/70">
        Members only — only children with an active subscription show up here.
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type the child's name…"
        className="w-full min-h-[52px] rounded-xl2 border-2 border-black/10 focus:border-brand-sky px-4 text-lg mb-4"
        autoFocus
      />

      {error && <p className="text-brand-coral text-sm mb-3">{error}</p>}
      {loading && <p className="text-sm text-brand-ink/40">Searching…</p>}
      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-brand-ink/40">
          No active members match that name.
        </p>
      )}

      <div className="space-y-3">
        {results.map((r) => (
          <div
            key={r.child_id}
            className="bg-white rounded-2xl border border-black/5 p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-bold text-brand-ink truncate">
                {r.child_name}{" "}
                <span className="text-brand-ink/40 font-normal">
                  · {r.age}y
                </span>
              </p>
              <p className="text-xs text-brand-ink/40 truncate">
                {r.parent_name} · ···{r.phone_last4}
              </p>
            </div>

            {r.currently_checked_in ? (
              <button
                onClick={() => handleCheckOut(r)}
                disabled={busyChildId === r.child_id}
                className="shrink-0 min-h-[44px] px-4 rounded-xl2 bg-brand-coral text-white text-sm font-semibold disabled:opacity-50"
              >
                {busyChildId === r.child_id ? "…" : "Check Out"}
              </button>
            ) : (
              <div className="shrink-0 flex gap-1">
                {[
                  { label: "1h", value: 60 },
                  { label: "2h", value: 120 },
                  { label: "∞", value: null },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => handleCheckIn(r, opt.value)}
                    disabled={busyChildId === r.child_id}
                    className="min-h-[44px] min-w-[44px] rounded-xl2 bg-brand-leaf text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
