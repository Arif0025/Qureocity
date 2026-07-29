"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Result = {
  customer_id: string;
  parent_name: string;
  phone: string;
  subscription_active: boolean;
  subscription_started_on: string | null;
  subscription_expires_on: string | null;
  children: { id: string; name: string; age: number; date_of_birth: string }[] | null;
  currently_checked_in: boolean;
};

function SubscriptionEditor({
  result,
  onSaved,
}: {
  result: Result;
  onSaved: (updated: {
    subscription_active: boolean;
    subscription_expires_on: string | null;
  }) => void;
}) {
  const supabase = createClient();
  const [active, setActive] = useState(result.subscription_active);
  const [expiresOn, setExpiresOn] = useState(
    result.subscription_expires_on ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("customers")
      .update({
        subscription_active: active,
        subscription_expires_on: expiresOn || null,
      })
      .eq("id", result.customer_id);
    setSaving(false);
    if (error) return setError(error.message);
    onSaved({
      subscription_active: active,
      subscription_expires_on: expiresOn || null,
    });
  };

  return (
    <div className="mt-3 rounded-xl border border-black/5 bg-brand-cloud/70 p-3">
      <p className="text-xs font-semibold text-brand-ink/60 mb-2">Membership</p>
      {error && <p className="text-brand-coral text-xs mb-2">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-brand-ink">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active subscriber
        </label>
        <input
          type="date"
          value={expiresOn}
          onChange={(e) => setExpiresOn(e.target.value)}
          className="min-h-[36px] rounded-lg border border-black/10 px-2 text-sm"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="min-h-[36px] px-3 rounded-lg bg-brand-sky text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

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
}: {
  isAdmin?: boolean;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyByCustomer, setHistoryByCustomer] = useState<
    Record<string, VisitHistoryEntry[]>
  >({});
  const [historyLoadingCustomerId, setHistoryLoadingCustomerId] = useState<
    string | null
  >(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const today = new Date().toISOString().slice(0, 10);
  const hasActiveSubscription = (result: Result) =>
    result.subscription_active &&
    (!result.subscription_expires_on || result.subscription_expires_on >= today);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setHistoryByCustomer({});
      setHistoryLoadingCustomerId(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("staff_search_customers", {
        p_query: query.trim(),
      });
      setLoading(false);
      if (!error) setResults((data as Result[]) ?? []);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, supabase]);

  const handleViewHistory = async (customerId: string) => {
    if (historyByCustomer[customerId]) {
      setHistoryByCustomer((prev) => {
        const next = { ...prev };
        delete next[customerId];
        return next;
      });
      return;
    }

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
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by parent name, child's name, or phone number…"
        className="w-full min-h-[52px] rounded-xl2 border-2 border-black/10 focus:border-brand-sky px-4 text-lg mb-4"
        autoFocus
      />

      {loading && <p className="text-sm text-brand-ink/40">Searching…</p>}

      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-brand-ink/40">No matches found.</p>
      )}

      <div className="space-y-3">
        {results.map((r) => (
          <div
            key={r.customer_id}
            className="bg-white rounded-2xl border border-black/5 p-5"
          >
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="font-bold text-brand-ink">{r.parent_name}</p>
              <div className="flex items-center gap-2 shrink-0">
                {hasActiveSubscription(r) ? (
                  <span className="text-xs font-semibold text-brand-sky bg-brand-sky/10 px-2 py-1 rounded-full">
                    Member
                  </span>
                ) : r.subscription_active && r.subscription_expires_on ? (
                  <span className="text-xs font-semibold text-brand-coral bg-brand-coral/10 px-2 py-1 rounded-full">
                    Membership expired
                  </span>
                ) : null}
                {r.currently_checked_in && (
                  <span className="text-xs font-semibold text-brand-leaf bg-brand-leaf/10 px-2 py-1 rounded-full">
                    Checked in now
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-brand-ink/50 mb-3">{r.phone}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {(r.children ?? []).map((child) => (
                <span
                  key={child.id}
                  className="text-sm bg-black/5 rounded-full px-3 py-1 text-brand-ink/70"
                >
                  {child.name} · {child.age}y
                </span>
              ))}
            </div>

            {isAdmin && (
              <SubscriptionEditor
                result={r}
                onSaved={(updated) =>
                  setResults((prev) =>
                    prev.map((row) =>
                      row.customer_id === r.customer_id
                        ? { ...row, ...updated }
                        : row,
                    ),
                  )
                }
              />
            )}

            <button
              type="button"
              onClick={() => handleViewHistory(r.customer_id)}
              className="mt-3 min-h-[40px] rounded-xl2 bg-brand-sky px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-sky/90"
            >
              {historyLoadingCustomerId === r.customer_id
                ? "Loading history…"
                : historyByCustomer[r.customer_id]
                  ? "Hide history"
                  : "View history"}
            </button>

            {historyByCustomer[r.customer_id] && (
              <div className="mt-4 rounded-xl border border-black/5 bg-brand-cloud/70 p-4">
                <p className="text-sm font-semibold text-brand-ink mb-3">
                  Visit history
                </p>
                <div className="space-y-3">
                  {historyByCustomer[r.customer_id].map((entry, index) => (
                    <div
                      key={`${entry.visit_day}-${entry.child_name}-${index}`}
                      className="rounded-xl bg-white p-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-brand-ink">
                          {entry.child_name}
                        </p>
                        <span className="text-xs font-medium text-brand-ink/50">
                          {new Date(entry.visit_day).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-brand-ink/60">
                        Checked in:{" "}
                        {new Date(entry.checked_in_at).toLocaleString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-sm text-brand-ink/60">
                        {entry.checked_out_at
                          ? `Checked out: ${new Date(entry.checked_out_at).toLocaleString([], { hour: "numeric", minute: "2-digit" })}`
                          : "Still checked in"}
                      </p>
                      <p className="text-xs text-brand-ink/40 mt-1">
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
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
