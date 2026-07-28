"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type SearchResult = {
  customer_id: string;
  parent_name: string;
  phone: string;
};

type Subscriber = {
  id: string;
  name: string;
  phone: string;
  subscription_active: boolean;
  subscription_started_on: string | null;
  subscription_expires_on: string | null;
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
  const [selected, setSelected] = useState<SearchResult | null>(null);
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
      setSearchResults(
        ((data as any[]) ?? []).map((r) => ({
          customer_id: r.customer_id,
          parent_name: r.parent_name,
          phone: r.phone,
        })),
      );
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [query, supabase]);

  const expiryPreview = addMonths(purchaseDate, duration);

  const handleSave = async () => {
    if (!selected)
      return setError("Search and select a registered family first.");
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const { error } = await supabase
      .from("customers")
      .update({
        subscription_active: true,
        subscription_started_on: purchaseDate,
        subscription_expires_on: expiryPreview,
      })
      .eq("id", selected.customer_id);

    setSaving(false);
    if (error) return setError(error.message);

    showSuccess(
      `${selected.parent_name}'s subscription is active until ${expiryPreview}.`,
    );
    setSelected(null);
    setQuery("");
    setSearchResults([]);
    loadSubscribers();
  };

  // --- List ---
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "expired"
  >("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const loadSubscribers = async () => {
    setLoadingList(true);
    const { data } = await supabase
      .from("customers")
      .select(
        "id, name, phone, subscription_active, subscription_started_on, subscription_expires_on",
      )
      .not("subscription_expires_on", "is", null);
    setSubscribers((data as any) ?? []);
    setLoadingList(false);
  };

  useEffect(() => {
    loadSubscribers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const isExpired = (s: Subscriber) =>
    !s.subscription_active || (s.subscription_expires_on ?? "") < todayStr;

  const filtered = subscribers
    .filter((s) => {
      if (statusFilter === "active") return !isExpired(s);
      if (statusFilter === "expired") return isExpired(s);
      return true;
    })
    .sort((a, b) => {
      const cmp = (a.subscription_expires_on ?? "").localeCompare(
        b.subscription_expires_on ?? "",
      );
      return sortDir === "asc" ? cmp : -cmp;
    });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-black/5 p-5">
        <p className="font-semibold text-brand-ink mb-1">
          Add or renew a subscription
        </p>
        <p className="text-xs text-brand-ink/40 mb-4">
          For families already registered — search to find them first.
        </p>

        {error && <p className="text-brand-coral text-sm mb-3">{error}</p>}
        {successMsg && (
          <p className="text-brand-leaf text-sm mb-3">{successMsg}</p>
        )}

        {!selected ? (
          <>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                clearSuccess();
              }}
              placeholder="Search by parent name, child's name, or phone…"
              className="w-full min-h-[48px] rounded-xl2 border-2 border-black/10 focus:border-brand-sky px-4 mb-3"
            />
            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.customer_id}
                    type="button"
                    onClick={() => {
                      clearSuccess();
                      setSelected(r);
                    }}
                    className="w-full text-left bg-brand-cloud/60 hover:bg-brand-cloud rounded-xl px-4 py-3 transition-colors border border-transparent hover:border-brand-sky/20"
                  >
                    <p className="font-semibold text-brand-ink text-sm">
                      {r.parent_name}
                    </p>
                    <p className="text-xs text-brand-ink/40">{r.phone}</p>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3 bg-brand-sky/10 rounded-xl px-4 py-3 mb-4">
              <div>
                <p className="font-semibold text-brand-ink">
                  {selected.parent_name}
                </p>
                <p className="text-xs text-brand-ink/50">{selected.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearSuccess();
                  setSelected(null);
                }}
                className="text-xs font-semibold text-brand-sky whitespace-nowrap"
              >
                Change
              </button>
            </div>

            <label className="block text-xs font-medium text-brand-ink/50 mb-1">
              Date purchased
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-black/10 px-3 mb-4"
            />

            <label className="block text-xs font-medium text-brand-ink/50 mb-2">
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
                      ? "border-brand-sky bg-brand-sky/10 text-brand-ink"
                      : "border-black/10 text-brand-ink/50"
                  }`}
                >
                  {m} {m === 1 ? "month" : "months"}
                </button>
              ))}
            </div>

            <p className="text-sm text-brand-ink/60 mb-4">
              Expires:{" "}
              <span className="font-semibold text-brand-ink">
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

      <div className="bg-white rounded-2xl border border-black/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="font-semibold text-brand-ink">All subscribers</p>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="min-h-[36px] rounded-lg border border-black/10 px-2 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="min-h-[36px] px-3 rounded-lg border border-black/10 text-sm font-medium text-brand-ink/60"
            >
              Expiry {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        {loadingList ? (
          <p className="text-sm text-brand-ink/40">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-brand-ink/40">No subscribers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[420px]">
              <thead className="text-brand-ink/40">
                <tr>
                  <th className="py-2 font-medium">Parent</th>
                  <th className="py-2 font-medium">Started</th>
                  <th className="py-2 font-medium">Expires</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const expired = isExpired(s);
                  return (
                    <tr key={s.id} className="border-t border-black/5">
                      <td className="py-2 font-medium text-brand-ink whitespace-nowrap">
                        {s.name}
                      </td>
                      <td className="py-2 text-brand-ink/60 whitespace-nowrap">
                        {s.subscription_started_on ?? "—"}
                      </td>
                      <td className="py-2 text-brand-ink/60 whitespace-nowrap">
                        {s.subscription_expires_on ?? "—"}
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
