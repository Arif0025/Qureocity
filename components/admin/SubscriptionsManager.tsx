"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type ChildInfo = {
  id: string;
  name: string;
  age: number;
  subscription_active: boolean;
  subscription_started_on: string | null;
  subscription_expires_on: string | null;
};

type SearchResult = {
  customer_id: string;
  parent_name: string;
  phone: string;
  any_active_subscription: boolean;
  children: ChildInfo[] | null;
  currently_checked_in: boolean;
};

type SubscriberRow = {
  child_id: string;
  child_name: string;
  parent_name: string;
  phone: string;
  active: boolean;
  started_on: string | null;
  expires_on: string | null;
};

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default function SubscriptionsManager() {
  const supabase = createClient();

  // --- Add / renew ---
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<SearchResult | null>(
    null,
  );
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [duration, setDuration] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearSuccess = () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMsg(null);
  };

  const showSuccess = (message: string) => {
    clearSuccess();
    setSuccessMsg(message);
    successTimerRef.current = setTimeout(() => setSuccessMsg(null), 5000);
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setSearchResults([]);
      clearSuccess();
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.rpc("staff_search_customers", {
        p_query: query.trim(),
      });
      setSearchResults((data as SearchResult[]) ?? []);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [query, supabase]);

  const expiryPreview = addMonths(purchaseDate, duration);

  const handleSave = async () => {
    if (!selectedFamily || !selectedChild)
      return setError("Select a family, then the specific child, first.");
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    // One row per child (upsert) — this is the actual fix: a subscription
    // belongs to a specific child, not to the whole family, so a second
    // child in the same family is never treated as a member just because
    // their sibling has an active plan.
    const { error } = await supabase.from("child_subscriptions").upsert(
      {
        child_id: selectedChild.id,
        active: true,
        started_on: purchaseDate,
        expires_on: expiryPreview,
        duration_months: duration,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "child_id" },
    );

    setSaving(false);
    if (error) return setError(error.message);

    showSuccess(
      `${selectedChild.name}'s subscription is active until ${expiryPreview}.`,
    );
    setSelectedFamily(null);
    setSelectedChild(null);
    setQuery("");
    setSearchResults([]);
    loadSubscribers();
  };

  // --- List ---
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "expired"
  >("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const loadSubscribers = async () => {
    setLoadingList(true);
    const { data } = await supabase.rpc("admin_list_child_subscriptions");
    setSubscribers((data as SubscriberRow[]) ?? []);
    setLoadingList(false);
  };

  useEffect(() => {
    loadSubscribers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const isExpired = (s: SubscriberRow) =>
    !s.active || (s.expires_on ?? "") < todayStr;

  const filtered = subscribers
    .filter((s) => {
      if (statusFilter === "active") return !isExpired(s);
      if (statusFilter === "expired") return isExpired(s);
      return true;
    })
    .sort((a, b) => {
      const cmp = (a.expires_on ?? "").localeCompare(b.expires_on ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });

  return (
    <div className="space-y-6">
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-5">
        <p className="font-semibold text-brand-nightText mb-1">
          Add or renew a subscription
        </p>
        <p className="text-xs text-brand-nightText/40 mb-4">
          For families already registered — search, pick the family, then the
          specific child the plan is for.
        </p>

        {error && <p className="text-brand-coral text-sm mb-3">{error}</p>}
        {successMsg && (
          <p className="text-brand-leaf text-sm mb-3">{successMsg}</p>
        )}

        {!selectedFamily ? (
          <>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                clearSuccess();
              }}
              placeholder="Search by parent name, child's name, or phone…"
              className="w-full min-h-[48px] rounded-xl2 border-2 border-white/15 focus:border-brand-sky bg-brand-nightSurface2 text-brand-nightText px-4 mb-3"
            />
            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.customer_id}
                    type="button"
                    onClick={() => {
                      clearSuccess();
                      setSelectedFamily(r);
                      setSelectedChild(null);
                    }}
                    className="w-full text-left bg-brand-nightSurface2/60 hover:bg-brand-nightSurface2 rounded-xl px-4 py-3 transition-colors border border-transparent hover:border-brand-sky/20"
                  >
                    <p className="font-semibold text-brand-nightText text-sm">
                      {r.parent_name}
                    </p>
                    <p className="text-xs text-brand-nightText/40">{r.phone}</p>
                    <p className="text-xs text-brand-nightText/50 mt-1">
                      {r.children
                        ?.map((child) => `${child.name} (${child.age}y)`)
                        .join(", ") || "No children registered"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : !selectedChild ? (
          <div>
            <div className="flex items-start justify-between gap-3 bg-brand-sky/10 rounded-xl px-4 py-3 mb-4">
              <div>
                <p className="font-semibold text-brand-nightText">
                  {selectedFamily.parent_name}
                </p>
                <p className="text-xs text-brand-nightText/50">
                  {selectedFamily.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFamily(null)}
                className="text-xs font-semibold text-brand-sky whitespace-nowrap"
              >
                Change
              </button>
            </div>

            <p className="text-xs font-medium text-brand-nightText/50 mb-2">
              Which child is this subscription for?
            </p>
            {!selectedFamily.children ||
            selectedFamily.children.length === 0 ? (
              <p className="text-sm text-brand-nightText/40">
                No children registered for this family yet.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedFamily.children.map((child) => {
                  const active =
                    child.subscription_active &&
                    (!child.subscription_expires_on ||
                      child.subscription_expires_on >= todayStr);
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setSelectedChild(child)}
                      className="w-full flex items-center justify-between gap-3 text-left bg-brand-nightSurface2/60 hover:bg-brand-nightSurface2 rounded-xl px-4 py-3 transition-colors border border-transparent hover:border-brand-sky/20"
                    >
                      <div>
                        <p className="font-semibold text-brand-nightText text-sm">
                          {child.name} · {child.age}y
                        </p>
                        {child.subscription_expires_on && (
                          <p className="text-xs text-brand-nightText/40 mt-0.5">
                            {active ? "Active until" : "Expired"}{" "}
                            {child.subscription_expires_on}
                          </p>
                        )}
                      </div>
                      {active && (
                        <span className="text-xs font-semibold text-brand-leaf bg-brand-leaf/10 px-2 py-1 rounded-full shrink-0">
                          Member
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3 bg-brand-sky/10 rounded-xl px-4 py-3 mb-4">
              <div>
                <p className="font-semibold text-brand-nightText">
                  {selectedChild.name}
                </p>
                <p className="text-xs text-brand-nightText/50">
                  {selectedFamily.parent_name} · {selectedFamily.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedChild(null)}
                className="text-xs font-semibold text-brand-sky whitespace-nowrap"
              >
                Change
              </button>
            </div>

            <label className="block text-xs font-medium text-brand-nightText/50 mb-1">
              Date purchased
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText px-3 mb-4 [color-scheme:dark]"
            />

            <label className="block text-xs font-medium text-brand-nightText/50 mb-2">
              Duration
            </label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[1, 2, 3].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m)}
                  className={`min-h-[48px] rounded-xl2 border-2 font-semibold ${
                    duration === m
                      ? "border-brand-sky bg-brand-sky/10 text-brand-nightText"
                      : "border-white/15 text-brand-nightText/50"
                  }`}
                >
                  {m} {m === 1 ? "month" : "months"}
                </button>
              ))}
            </div>

            <p className="text-sm text-brand-nightText/60 mb-4">
              Expires:{" "}
              <span className="font-semibold text-brand-nightText">
                {expiryPreview}
              </span>
            </p>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full min-h-[48px] rounded-xl2 bg-brand-sky text-white font-bold disabled:opacity-50"
            >
              {saving ? "Saving…" : "Activate subscription"}
            </button>
          </div>
        )}
      </div>

      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="font-semibold text-brand-nightText">All subscribers</p>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="min-h-[36px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText px-2 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="min-h-[36px] px-3 rounded-lg border border-white/15 text-sm font-medium text-brand-nightText/60"
            >
              Expiry {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        {loadingList ? (
          <p className="text-sm text-brand-nightText/40">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-brand-nightText/40">No subscribers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[480px]">
              <thead className="text-brand-nightText/40">
                <tr>
                  <th className="py-2 font-medium">Child</th>
                  <th className="py-2 font-medium">Parent</th>
                  <th className="py-2 font-medium">Mobile</th>
                  <th className="py-2 font-medium">Started</th>
                  <th className="py-2 font-medium">Expires</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const expired = isExpired(s);
                  return (
                    <tr key={s.child_id} className="border-t border-white/10">
                      <td className="py-2 font-medium text-brand-nightText whitespace-nowrap">
                        {s.child_name}
                      </td>
                      <td className="py-2 text-brand-nightText/60 whitespace-nowrap">
                        {s.parent_name}
                      </td>
                      <td className="py-2 text-brand-nightText/60 whitespace-nowrap">
                        {s.phone}
                      </td>
                      <td className="py-2 text-brand-nightText/60 whitespace-nowrap">
                        {s.started_on ?? "—"}
                      </td>
                      <td className="py-2 text-brand-nightText/60 whitespace-nowrap">
                        {s.expires_on ?? "—"}
                      </td>
                      <td className="py-2">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${
                            expired
                              ? "bg-brand-coral/10 text-brand-coral"
                              : "bg-brand-leaf/10 text-brand-leaf"
                          }`}
                        >
                          {expired ? "Expired" : "Active"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
