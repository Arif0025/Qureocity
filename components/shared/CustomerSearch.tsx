"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Search, Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";

type ChildInfo = {
  id: string;
  name: string;
  age: number;
  subscription_active: boolean;
  subscription_started_on: string | null;
  subscription_expires_on: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  special_instructions: string | null;
};

function hasMedicalInfo(c: ChildInfo): boolean {
  return !!(c.allergies || c.medical_conditions || c.special_instructions);
}

type Result = {
  customer_id: string;
  parent_name: string;
  phone: string;
  created_at?: string;
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
  filterNewThisMonth = false,
}: {
  isAdmin?: boolean;
  initialQuery?: string;
  focusCustomerPhone?: string | null;
  filterNewThisMonth?: boolean;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Result[]>([]);
  const [loadingGlimpse, setLoadingGlimpse] = useState(true);
  const [searching, setSearching] = useState(false);
  const [newOnly, setNewOnly] = useState(filterNewThisMonth);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedChildByCustomer, setSelectedChildByCustomer] = useState<
    Record<string, string | null> // customer_id -> child_id | null (null = "all children")
  >({});
  const [historyByKey, setHistoryByKey] = useState<
    Record<string, VisitHistoryEntry[]> // `${customerId}:${childId ?? "all"}`
  >({});
  const [historyLoadingKey, setHistoryLoadingKey] = useState<string | null>(
    null,
  );
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
    async (customerId: string, childId: string | null) => {
      const key = `${customerId}:${childId ?? "all"}`;
      setHistoryLoadingKey(key);
      const { data, error } = await supabase.rpc("customer_visit_history", {
        p_customer_id: customerId,
        p_child_id: childId,
      });
      setHistoryLoadingKey(null);

      if (!error) {
        setHistoryByKey((prev) => ({
          ...prev,
          [key]: (data as VisitHistoryEntry[]) ?? [],
        }));
      }
    },
    [supabase],
  );

  const handleViewHistory = async (customerId: string) => {
    const childId = selectedChildByCustomer[customerId] ?? null;
    const key = `${customerId}:${childId ?? "all"}`;
    if (historyByKey[key]) {
      setHistoryByKey((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    await loadHistory(customerId, childId);
  };

  const selectChildFilter = (customerId: string, childId: string | null) => {
    setSelectedChildByCustomer((prev) => ({ ...prev, [customerId]: childId }));
  };

  useEffect(() => {
    if (!focusCustomerPhone) return;
    const match = results.find((r) => r.phone === focusCustomerPhone);
    if (!match) return;
    setExpandedId(match.customer_id);
    const key = `${match.customer_id}:all`;
    if (!historyByKey[key]) {
      void loadHistory(match.customer_id, null);
    }
  }, [focusCustomerPhone, historyByKey, loadHistory, results]);

  const loading = query.trim().length >= 2 ? searching : loadingGlimpse;
  const [onSiteFirst, setOnSiteFirst] = useState(false);
  const monthStartStr = `${new Date().toISOString().slice(0, 7)}-01`;
  const baseResults = newOnly
    ? results.filter((r) => (r.created_at ?? "") >= monthStartStr)
    : results;
  const displayedResults = onSiteFirst
    ? [...baseResults].sort(
        (a, b) =>
          Number(b.currently_checked_in) - Number(a.currently_checked_in),
      )
    : baseResults;

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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setNewOnly((v) => !v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              newOnly
                ? "border-brand-sky/40 bg-brand-sky/10 text-brand-skyLight"
                : "border-white/15 text-brand-nightText/50"
            }`}
          >
            New this month
          </button>
          <button
            type="button"
            onClick={() => setOnSiteFirst((v) => !v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              onSiteFirst
                ? "border-brand-leaf/40 bg-brand-leaf/10 text-brand-leaf"
                : "border-white/15 text-brand-nightText/50"
            }`}
          >
            On site first
          </button>
        </div>
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
                  {(r.children ?? []).some(hasMedicalInfo) && (
                    <Heart
                      size={13}
                      className="text-brand-coral shrink-0"
                      fill="currentColor"
                    />
                  )}
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
                    {(r.children ?? []).length > 1 &&
                      " — tap to filter history"}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(r.children ?? []).length === 0 && (
                      <p className="text-sm text-brand-nightText/40">
                        No children registered.
                      </p>
                    )}
                    {(r.children ?? []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => selectChildFilter(r.customer_id, null)}
                        className={`text-sm rounded-full px-3 py-1.5 border transition-colors ${
                          (selectedChildByCustomer[r.customer_id] ?? null) ===
                          null
                            ? "border-brand-sky bg-brand-sky/15 text-brand-skyLight"
                            : "border-white/15 bg-white/[0.04] text-brand-nightText/50"
                        }`}
                      >
                        All children
                      </button>
                    )}
                    {(r.children ?? []).map((child) => {
                      const active =
                        child.subscription_active &&
                        (!child.subscription_expires_on ||
                          child.subscription_expires_on >= today);
                      const isSelected =
                        selectedChildByCustomer[r.customer_id] === child.id;
                      const multiKid = (r.children ?? []).length > 1;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() =>
                            multiKid &&
                            selectChildFilter(
                              r.customer_id,
                              isSelected ? null : child.id,
                            )
                          }
                          className={`flex items-center gap-1.5 text-sm rounded-full px-3 py-1.5 border transition-colors ${
                            multiKid
                              ? isSelected
                                ? "border-brand-sky bg-brand-sky/15 text-brand-skyLight"
                                : "border-white/15 bg-white/[0.04] text-brand-nightText/60"
                              : active
                                ? "border-transparent bg-brand-sky/15 text-brand-skyLight"
                                : "border-transparent bg-white/8 text-brand-nightText/70"
                          }`}
                        >
                          {hasMedicalInfo(child) && (
                            <Heart
                              size={11}
                              className="text-brand-coral shrink-0"
                              fill="currentColor"
                            />
                          )}
                          {child.name} · {child.age}y{active && " · Member"}
                        </button>
                      );
                    })}
                  </div>

                  {(r.children ?? []).some(hasMedicalInfo) && (
                    <div className="rounded-lg bg-brand-coral/8 border border-brand-coral/20 px-3 py-2.5 mb-4 space-y-1.5">
                      {(r.children ?? [])
                        .filter(hasMedicalInfo)
                        .map((child) => (
                          <div key={child.id}>
                            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-coral uppercase tracking-wide">
                              <Heart size={11} fill="currentColor" />{" "}
                              {child.name}
                            </p>
                            {child.allergies && (
                              <p className="text-xs text-brand-nightText/70">
                                Allergies: {child.allergies}
                              </p>
                            )}
                            {child.medical_conditions && (
                              <p className="text-xs text-brand-nightText/70">
                                Conditions: {child.medical_conditions}
                              </p>
                            )}
                            {child.special_instructions && (
                              <p className="text-xs text-brand-nightText/70">
                                Notes: {child.special_instructions}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  )}

                  {isAdmin && (r.children ?? []).length > 0 && (
                    <p className="text-xs text-brand-nightText/35 mb-4">
                      To activate or renew a membership, use the Memberships tab
                      and pick this family + child.
                    </p>
                  )}

                  {(() => {
                    const childId =
                      selectedChildByCustomer[r.customer_id] ?? null;
                    const key = `${r.customer_id}:${childId ?? "all"}`;
                    const history = historyByKey[key];
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => handleViewHistory(r.customer_id)}
                          className="min-h-[40px] rounded-xl2 bg-brand-sky px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-sky/90"
                        >
                          {historyLoadingKey === key
                            ? "Loading history…"
                            : history
                              ? "Hide history"
                              : childId
                                ? `View ${(r.children ?? []).find((c) => c.id === childId)?.name}'s history`
                                : "View history"}
                        </button>

                        {history && (
                          <div className="mt-4 rounded-xl border border-white/10 bg-brand-nightSurface2/70 p-4">
                            <p className="text-sm font-semibold text-brand-nightText mb-3">
                              Visit history
                            </p>
                            {history.length === 0 ? (
                              <p className="text-sm text-brand-nightText/40">
                                No visits recorded yet.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {history.map((entry, index) => (
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
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
