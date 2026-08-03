"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";

type ChildInfo = {
  id: string;
  name: string;
  age: number;
  subscription_active: boolean;
  subscription_started_on: string | null;
  subscription_expires_on: string | null;
};

type Result = {
  customer_id: string;
  parent_name: string;
  phone: string;
  any_active_subscription: boolean;
  children: ChildInfo[] | null;
  currently_checked_in: boolean;
};

type VisitHistoryEntry = {
  child_name: string;
  checked_in_at: string;
  checked_out_at: string | null;
  status: string;
  visit_day: string;
  intended_duration_mins: number | null;
  actual_duration_mins: number | null;
};

export default function CustomerSearch({
  isAdmin = false,
  initialQuery = "",
  focusCustomerPhone,
}: {
  isAdmin?: boolean;
  initialQuery?: string;
  focusCustomerPhone?: string | null;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Result[]>([]);
  const [loadingGlimpse, setLoadingGlimpse] = useState(true);
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyByCustomer, setHistoryByCustomer] = useState<
    Record<string, VisitHistoryEntry[]>
  >({});
  const [historyLoadingCustomerId, setHistoryLoadingCustomerId] = useState<
    string | null
  >(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // The "glimpse" — a browsable list of registered families before
  // anyone types anything, so the tab isn't just an empty search box.
  const loadGlimpse = useCallback(async () => {
    setLoadingGlimpse(true);
    const { data, error } = await supabase.rpc("staff_list_customers", {
      p_limit: 30,
    });
    setLoadingGlimpse(false);
    if (!error) setResults((data as Result[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    void loadGlimpse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setSearching(false);
      void loadGlimpse();
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase.rpc("staff_search_customers", {
        p_query: query.trim(),
      });
      setSearching(false);
      if (!error) setResults((data as Result[]) ?? []);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, supabase]);

  const loadHistory = useCallback(
    async (customerId: string) => {
      setHistoryLoadingCustomerId(customerId);
      const { data, error } = await supabase.rpc("customer_visit_history", {
        p_customer_id: customerId,
      });
      setHistoryLoadingCustomerId(null);

      if (!error) {
        setHistoryByCustomer((prev) => ({
          ...prev,
          [customerId]: (data as VisitHistoryEntry[]) ?? [],
        }));
      }
    },
    [supabase],
  );

  const handleViewHistory = async (customerId: string) => {
    if (historyByCustomer[customerId]) {
      setHistoryByCustomer((prev) => {
        const next = { ...prev };
        delete next[customerId];
        return next;
      });
      return;
    }

    await loadHistory(customerId);
  };

  useEffect(() => {
    if (!focusCustomerPhone) return;
    const match = results.find((r) => r.phone === focusCustomerPhone);
    if (!match) return;
    setExpandedId(match.customer_id);
    if (!historyByCustomer[match.customer_id]) {
      void loadHistory(match.customer_id);
    }
  }, [focusCustomerPhone, historyByCustomer, loadHistory, results]);

  const loading = query.trim().length >= 2 ? searching : loadingGlimpse;
  const [onSiteFirst, setOnSiteFirst] = useState(false);
  const displayedResults = onSiteFirst
    ? [...results].sort(
        (a, b) =>
          Number(b.currently_checked_in) - Number(a.currently_checked_in),
      )
    : results;

  return (
    <div>
      <div className="relative mb-4">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-nightText/30"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by parent name, child's name, or phone number…"
          className="w-full min-h-[52px] rounded-xl2 border-2 border-white/15 focus:border-brand-sky bg-brand-nightSurface2 text-brand-nightText pl-11 pr-4 text-base"
        />
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        {query.trim().length < 2 && !loadingGlimpse ? (
          <p className="text-xs text-brand-nightText/35">
            Showing {results.length} most recently active families — type to
            search everyone.
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setOnSiteFirst((v) => !v)}
          className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            onSiteFirst
              ? "border-brand-leaf/40 bg-brand-leaf/10 text-brand-leaf"
              : "border-white/15 text-brand-nightText/50"
          }`}
        >
          On site first
        </button>
      </div>

      {loading && <p className="text-sm text-brand-nightText/40">Loading…</p>}

      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-brand-nightText/40">No matches found.</p>
      )}

      <div className="space-y-2">
        {displayedResults.map((r) => {
          const isOpen = expandedId === r.customer_id;
          return (
            <div
              key={r.customer_id}
              className="bg-brand-nightSurface rounded-2xl border border-white/10 overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(isOpen ? null : r.customer_id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-nightText truncate">
                    {r.parent_name}
                  </p>
                  <p className="text-xs text-brand-nightText/40 truncate">
                    {r.phone} ·{" "}
                    {(r.children ?? []).map((c) => c.name).join(", ") ||
                      "No children registered"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.any_active_subscription && (
                    <span className="text-xs font-semibold text-brand-sky bg-brand-sky/15 px-2 py-1 rounded-full">
                      Member
                    </span>
                  )}
                  {r.currently_checked_in && (
                    <span className="text-xs font-semibold text-brand-leaf bg-brand-leaf/10 px-2 py-1 rounded-full">
                      On site
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    className={`text-brand-nightText/25 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-1 border-t border-white/8">
                  <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mt-3 mb-2">
                    Children
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(r.children ?? []).length === 0 && (
                      <p className="text-sm text-brand-nightText/40">
                        No children registered.
                      </p>
                    )}
                    {(r.children ?? []).map((child) => {
                      const active =
                        child.subscription_active &&
                        (!child.subscription_expires_on ||
                          child.subscription_expires_on >= today);
                      return (
                        <span
                          key={child.id}
                          className={`text-sm rounded-full px-3 py-1.5 ${
                            active
                              ? "bg-brand-sky/15 text-brand-skyLight"
                              : "bg-white/8 text-brand-nightText/70"
                          }`}
                        >
                          {child.name} · {child.age}y{active && " · Member"}
                        </span>
                      );
                    })}
                  </div>

                  {isAdmin && (r.children ?? []).length > 0 && (
                    <p className="text-xs text-brand-nightText/35 mb-4">
                      To activate or renew a subscription, use the Subscriptions
                      tab and pick this family + child.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => handleViewHistory(r.customer_id)}
                    className="min-h-[40px] rounded-xl2 bg-brand-sky px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-sky/90"
                  >
                    {historyLoadingCustomerId === r.customer_id
                      ? "Loading history…"
                      : historyByCustomer[r.customer_id]
                        ? "Hide history"
                        : "View history"}
                  </button>

                  {historyByCustomer[r.customer_id] && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-brand-nightSurface2/70 p-4">
                      <p className="text-sm font-semibold text-brand-nightText mb-3">
                        Visit history
                      </p>
                      {historyByCustomer[r.customer_id].length === 0 ? (
                        <p className="text-sm text-brand-nightText/40">
                          No visits recorded yet.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {historyByCustomer[r.customer_id].map(
                            (entry, index) => (
                              <div
                                key={`${entry.visit_day}-${entry.child_name}-${index}`}
                                className="rounded-xl bg-brand-nightSurface p-3"
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <p className="text-sm font-semibold text-brand-nightText">
                                    {entry.child_name}
                                  </p>
                                  <span className="text-xs font-medium text-brand-nightText/50">
                                    {new Date(
                                      entry.visit_day,
                                    ).toLocaleDateString([], {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })}
                                  </span>
                                </div>
                                <p className="text-sm text-brand-nightText/60">
                                  Checked in:{" "}
                                  {formatTimeIST(entry.checked_in_at)}
                                </p>
                                <p className="text-sm text-brand-nightText/60">
                                  {entry.checked_out_at
                                    ? `Checked out: ${formatTimeIST(entry.checked_out_at)}`
                                    : "Still checked in"}
                                </p>
                                <p className="text-xs text-brand-nightText/40 mt-1">
                                  {entry.status === "active"
                                    ? "Currently active"
                                    : entry.status === "completed"
                                      ? "Completed"
                                      : entry.status === "expired"
                                        ? "Expired"
                                        : entry.status}
                                  {entry.intended_duration_mins !== null
                                    ? ` • planned ${entry.intended_duration_mins} min`
                                    : ""}
                                  {entry.actual_duration_mins !== null
                                    ? ` • actual ${entry.actual_duration_mins} min`
                                    : ""}
                                </p>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
