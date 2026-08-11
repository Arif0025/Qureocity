"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, Heart, School, Phone, MapPin } from "lucide-react";

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
  date_of_birth: string | null;
  gender: string | null;
  school: string | null;
  interests: string[] | null;
  allergies: string | null;
  medical_conditions: string | null;
  special_instructions: string | null;
  parent_name: string;
  phone: string;
  secondary_phone: string | null;
  address: string | null;
  how_heard: string | null;
  photo_consent: boolean;
  whatsapp_consent: boolean;
  active: boolean;
  started_on: string | null;
  expires_on: string | null;
  plan_name: string | null;
  receipt_number: string | null;
};

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default function SubscriptionsManager({
  initialFilter,
}: {
  initialFilter?: "expiring_soon" | "new_this_month";
} = {}) {
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
    "all" | "active" | "expired" | "expiring_soon" | "new_this_month"
  >(initialFilter ?? "all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);

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
  const sevenDaysOutStr = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const monthStartStr = `${todayStr.slice(0, 7)}-01`;
  const isExpired = (s: SubscriberRow) =>
    !s.active || (s.expires_on ?? "") < todayStr;

  const filtered = subscribers
    .filter((s) => {
      if (statusFilter === "active") return !isExpired(s);
      if (statusFilter === "expired") return isExpired(s);
      if (statusFilter === "expiring_soon")
        return (
          s.active &&
          !!s.expires_on &&
          s.expires_on >= todayStr &&
          s.expires_on <= sevenDaysOutStr
        );
      if (statusFilter === "new_this_month")
        return !!s.started_on && s.started_on >= monthStartStr;
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
          Add or renew a membership
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
          <p className="font-semibold text-brand-nightText">All members</p>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="min-h-[36px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText px-2 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="expiring_soon">Expiring in 7 days</option>
              <option value="new_this_month">New this month</option>
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
          <p className="text-sm text-brand-nightText/40">No members yet.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const expired = isExpired(s);
              const isOpen = expandedChildId === s.child_id;
              const hasMedical =
                s.allergies || s.medical_conditions || s.special_instructions;
              return (
                <div
                  key={s.child_id}
                  className="rounded-xl border border-white/10 overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedChildId(isOpen ? null : s.child_id)
                    }
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="flex items-center gap-1.5 font-medium text-brand-nightText text-sm truncate">
                        {s.child_name}
                        {hasMedical && (
                          <Heart
                            size={11}
                            className="text-brand-coral shrink-0"
                            fill="currentColor"
                          />
                        )}
                      </p>
                      <p className="text-xs text-brand-nightText/40 truncate">
                        {s.parent_name}
                        {s.plan_name && ` · ${s.plan_name}`}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap shrink-0 ${
                        expired
                          ? "bg-brand-coral/10 text-brand-coral"
                          : "bg-brand-leaf/10 text-brand-leaf"
                      }`}
                    >
                      {expired ? "Expired" : "Active"}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-brand-nightText/25 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-white/10 bg-white/[0.035] space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3 mt-3 text-sm">
                        <div>
                          <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mb-1">
                            Child
                          </p>
                          <p className="text-brand-nightText">
                            {s.child_name}
                            {s.gender ? ` · ${s.gender}` : ""}
                            {s.date_of_birth ? ` · ${s.date_of_birth}` : ""}
                          </p>
                          {s.school && (
                            <p className="flex items-center gap-1 text-xs text-brand-nightText/50 mt-1">
                              <School size={12} /> {s.school}
                            </p>
                          )}
                          {s.interests && s.interests.length > 0 && (
                            <p className="text-xs text-brand-nightText/50 mt-1">
                              Interests: {s.interests.join(", ")}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mb-1">
                            Guardian
                          </p>
                          <p className="text-brand-nightText">
                            {s.parent_name}
                          </p>
                          <a
                            href={`tel:${s.phone}`}
                            className="flex items-center gap-1 text-xs text-brand-sky hover:underline mt-1 w-fit"
                          >
                            <Phone size={12} /> {s.phone}
                            {s.secondary_phone ? ` / ${s.secondary_phone}` : ""}
                          </a>
                          {s.address && (
                            <p className="flex items-center gap-1 text-xs text-brand-nightText/50 mt-1">
                              <MapPin size={12} /> {s.address}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mb-1">
                            Membership
                          </p>
                          <p className="text-brand-nightText">
                            {s.plan_name ?? "No plan on file"}
                          </p>
                          <p className="text-xs text-brand-nightText/50 mt-1">
                            {s.started_on ?? "—"} → {s.expires_on ?? "—"}
                          </p>
                          {s.receipt_number && (
                            <p className="text-xs text-brand-nightText/35 font-mono mt-1">
                              {s.receipt_number}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mb-1">
                            Preferences
                          </p>
                          <p className="text-xs text-brand-nightText/50">
                            Heard via: {s.how_heard ?? "—"}
                          </p>
                          <p className="text-xs text-brand-nightText/50">
                            Photo consent: {s.photo_consent ? "Yes" : "No"} ·
                            WhatsApp: {s.whatsapp_consent ? "Yes" : "No"}
                          </p>
                        </div>
                      </div>

                      {hasMedical && (
                        <div className="rounded-lg bg-brand-coral/8 border border-brand-coral/20 px-3 py-2.5">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-coral uppercase tracking-wide mb-1.5">
                            <Heart size={12} fill="currentColor" /> Medical
                          </p>
                          {s.allergies && (
                            <p className="text-xs text-brand-nightText/70">
                              Allergies: {s.allergies}
                            </p>
                          )}
                          {s.medical_conditions && (
                            <p className="text-xs text-brand-nightText/70">
                              Conditions: {s.medical_conditions}
                            </p>
                          )}
                          {s.special_instructions && (
                            <p className="text-xs text-brand-nightText/70">
                              Notes: {s.special_instructions}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
