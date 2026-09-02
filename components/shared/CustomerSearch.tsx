"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Heart,
  BadgeCheck,
  LogIn,
  LogOut,
  Pencil,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";
import { todayISTDateString } from "@/lib/istTime";
import { getClientKey } from "@/lib/clientKey";
import PillSelect from "./PillSelect";
import ListRow from "./ListRow";
import PhoneLinks from "./PhoneLinks";

type ChildInfo = {
  id: string;
  name: string;
  date_of_birth?: string;
  age: number;
  subscription_active: boolean;
  subscription_started_on: string | null;
  subscription_expires_on: string | null;
  plan_name: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  special_instructions: string | null;
  currently_checked_in: boolean;
  active_session_id: string | null;
};

function hasMedicalInfo(c: ChildInfo): boolean {
  return !!(c.allergies || c.medical_conditions || c.special_instructions);
}

function ageFromDateOfBirth(dateOfBirth: string): number {
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }
  return age;
}

type Result = {
  customer_id: string;
  parent_name: string;
  phone: string;
  secondary_phone: string | null;
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
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);
  const [historyByChild, setHistoryByChild] = useState<
    Record<string, VisitHistoryEntry[]>
  >({});
  const [historyLoadingChild, setHistoryLoadingChild] = useState<string | null>(
    null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const today = todayISTDateString();
  const [planFilter, setPlanFilter] = useState("");
  const [planOptions, setPlanOptions] = useState<
    { id: string; name: string; plan_type: "recurring" | "special" }[]
  >([]);
  const [onSiteFirst, setOnSiteFirst] = useState(false);
  const [checkinBusyId, setCheckinBusyId] = useState<string | null>(null);
  const [durationPickerFor, setDurationPickerFor] = useState<{
    customerId: string;
    childId: string;
    childName: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingNames, setEditingNames] = useState<{
    customerId: string;
    childId: string;
    parentName: string;
    childName: string;
    dateOfBirth: string;
    address: string;
    allergies: string;
    medicalConditions: string;
    specialInstructions: string;
  } | null>(null);
  const [savingNames, setSavingNames] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState(false);

  const patchChild = (
    customerId: string,
    childId: string,
    patch: Partial<ChildInfo>,
  ) => {
    setResults((prev) =>
      prev.map((r) =>
        r.customer_id !== customerId
          ? r
          : {
              ...r,
              children: (r.children ?? []).map((c) =>
                c.id === childId ? { ...c, ...patch } : c,
              ),
            },
      ),
    );
  };

  const handleCheckIn = async (
    customerId: string,
    childId: string,
    durationMins: number | null,
  ) => {
    setCheckinBusyId(childId);
    setActionError(null);
    const { data, error } = await supabase.rpc("checkin_create_sessions", {
      p_customer_id: customerId,
      p_child_ids: [childId],
      p_duration_mins: durationMins,
      p_client_key: getClientKey(),
      p_status: "active",
    });
    setCheckinBusyId(null);
    setDurationPickerFor(null);
    if (error) return setActionError(error.message);
    const sessionId = data?.sessions?.[0]?.session_id ?? null;
    patchChild(customerId, childId, {
      currently_checked_in: true,
      active_session_id: sessionId,
    });
  };

  const handleCheckOut = async (
    customerId: string,
    childId: string,
    sessionId: string,
  ) => {
    setCheckinBusyId(childId);
    setActionError(null);
    const { error } = await supabase.rpc("checkout_session", {
      p_session_id: sessionId,
    });
    setCheckinBusyId(null);
    if (error) return setActionError(error.message);
    patchChild(customerId, childId, {
      currently_checked_in: false,
      active_session_id: null,
    });
  };

  const beginEditDetails = async (customerId: string, child: ChildInfo) => {
    const [{ data: customer }, { data: childData }] = await Promise.all([
      supabase
        .from("customers")
        .select("address")
        .eq("id", customerId)
        .single(),
      supabase
        .from("children")
        .select(
          "date_of_birth, allergies, medical_conditions, special_instructions",
        )
        .eq("id", child.id)
        .eq("customer_id", customerId)
        .single(),
    ]);
    setEditingNames({
      customerId,
      childId: child.id,
      parentName:
        results.find((result) => result.customer_id === customerId)
          ?.parent_name ?? "",
      childName: child.name,
      dateOfBirth: childData?.date_of_birth ?? "",
      address: customer?.address ?? "",
      allergies: childData?.allergies ?? "",
      medicalConditions: childData?.medical_conditions ?? "",
      specialInstructions: childData?.special_instructions ?? "",
    });
  };

  const handleSaveNames = async () => {
    if (!editingNames) return;
    setSavingNames(true);
    setActionError(null);
    const { error } = await supabase.rpc(
      "admin_update_customer_child_details",
      {
        p_customer_id: editingNames.customerId,
        p_child_id: editingNames.childId,
        p_parent_name: editingNames.parentName,
        p_child_name: editingNames.childName,
        p_date_of_birth: editingNames.dateOfBirth,
        p_address: editingNames.address,
        p_allergies: editingNames.allergies,
        p_medical_conditions: editingNames.medicalConditions,
        p_special_instructions: editingNames.specialInstructions,
      },
    );
    setSavingNames(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    setResults((prev) =>
      prev.map((result) =>
        result.customer_id !== editingNames.customerId
          ? result
          : {
              ...result,
              parent_name: editingNames.parentName.trim(),
              children: (result.children ?? []).map((child) =>
                child.id !== editingNames.childId
                  ? child
                  : {
                      ...child,
                      name: editingNames.childName.trim(),
                      age: ageFromDateOfBirth(editingNames.dateOfBirth),
                      date_of_birth: editingNames.dateOfBirth,
                      allergies: editingNames.allergies.trim() || null,
                      medical_conditions:
                        editingNames.medicalConditions.trim() || null,
                      special_instructions:
                        editingNames.specialInstructions.trim() || null,
                    },
              ),
            },
      ),
    );
    setEditingNames(null);
  };

  const handleDeleteCustomer = async (
    customerId: string,
    parentName: string,
  ) => {
    if (
      !window.confirm(
        `Remove ${parentName} and all of their children? Historical registration records will be preserved, but this cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingCustomer(true);
    setActionError(null);
    const { error } = await supabase.rpc("admin_delete_customer", {
      p_customer_id: customerId,
    });
    setDeletingCustomer(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    setResults((prev) =>
      prev.filter((result) => result.customer_id !== customerId),
    );
    setExpandedChildId(null);
    setEditingNames(null);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("membership_plans")
        .select("id, name, plan_type")
        .order("plan_type", { ascending: true })
        .order("name", { ascending: true });
      setPlanOptions(data ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // The "glimpse" — a browsable list of registered families before
  // anyone types anything, so the tab isn't just an empty search box.
  const addSecondaryPhones = useCallback(
    async (rows: Result[]) => {
      if (rows.length === 0) return rows;
      const ids = rows.map((row) => row.customer_id);
      const { data } = await supabase
        .from("customers")
        .select("id, secondary_phone")
        .in("id", ids);
      const secondaryById = new Map(
        ((data as { id: string; secondary_phone: string | null }[]) ?? []).map(
          (row) => [row.id, row.secondary_phone],
        ),
      );
      return rows.map((row) => ({
        ...row,
        secondary_phone: secondaryById.get(row.customer_id) ?? null,
      }));
    },
    [supabase],
  );

  const loadGlimpse = useCallback(async () => {
    setLoadingGlimpse(true);
    const { data, error } = await supabase.rpc("staff_list_customers", {
      p_limit: 30,
      p_plan_id: planFilter || null,
    });
    setLoadingGlimpse(false);
    if (!error) setResults(await addSecondaryPhones((data as Result[]) ?? []));
  }, [addSecondaryPhones, supabase, planFilter]);

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
        p_plan_id: planFilter || null,
      });
      setSearching(false);
      if (!error)
        setResults(await addSecondaryPhones((data as Result[]) ?? []));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, supabase, planFilter]);

  const loadHistory = useCallback(
    async (customerId: string, childId: string) => {
      setHistoryLoadingChild(childId);
      const { data, error } = await supabase.rpc("customer_visit_history", {
        p_customer_id: customerId,
        p_child_id: childId,
      });
      setHistoryLoadingChild(null);
      if (!error) {
        setHistoryByChild((prev) => ({
          ...prev,
          [childId]: (data as VisitHistoryEntry[]) ?? [],
        }));
      }
    },
    [supabase],
  );

  const toggleHistory = async (customerId: string, childId: string) => {
    if (historyByChild[childId]) {
      setHistoryByChild((prev) => {
        const next = { ...prev };
        delete next[childId];
        return next;
      });
      return;
    }
    await loadHistory(customerId, childId);
  };

  useEffect(() => {
    if (!focusCustomerPhone) return;
    const match = results.find((r) => r.phone === focusCustomerPhone);
    const firstChild = match?.children?.[0];
    if (!match || !firstChild) return;
    setExpandedChildId(firstChild.id);
    if (!historyByChild[firstChild.id]) {
      void loadHistory(match.customer_id, firstChild.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCustomerPhone, results]);

  const loading = query.trim().length >= 2 ? searching : loadingGlimpse;
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

      <div className="flex items-center justify-end gap-3 mb-3">
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <PillSelect
            value={planFilter}
            onChange={setPlanFilter}
            placeholder="All plans"
            options={planOptions.map((p) => ({
              value: p.id,
              label: p.name,
              group:
                p.plan_type === "recurring" ? "Monthly plans" : "Special days",
            }))}
          />
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

      {actionError && (
        <div className="mb-3 rounded-xl border border-brand-coral/30 bg-brand-coral/10 px-3.5 py-2.5 text-sm text-brand-coral">
          {actionError}
        </div>
      )}

      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-brand-nightText/40">No matches found.</p>
      )}

      <div className="space-y-3">
        {displayedResults.map((r) => {
          const kids = r.children ?? [];
          return (
            <div
              key={r.customer_id}
              className={`rounded-2xl overflow-hidden ${
                kids.length > 1 ? "border-l-2 border-brand-sky/30 pl-2.5" : ""
              }`}
            >
              {kids.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-brand-nightSurface px-3.5 py-3">
                  <p className="text-sm font-semibold text-brand-nightText">
                    {r.parent_name}
                  </p>
                  <p className="text-xs text-brand-nightText/40">
                    {r.phone} · No children registered yet
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                {kids.map((child) => {
                  const isMember =
                    child.subscription_active &&
                    (!child.subscription_expires_on ||
                      child.subscription_expires_on >= today);
                  const isOpen = expandedChildId === child.id;
                  const history = historyByChild[child.id];

                  return (
                    <ListRow
                      key={child.id}
                      title={child.name}
                      subtitle={`${child.age}y`}
                      safetyFlag={
                        hasMedicalInfo(child) ? (
                          <Heart
                            size={12}
                            className="text-brand-coral shrink-0"
                            fill="currentColor"
                          />
                        ) : r.currently_checked_in ? (
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-brand-leaf bg-brand-leaf/10 rounded-full px-1.5 py-0.5 shrink-0">
                            On site
                          </span>
                        ) : undefined
                      }
                      facts={[
                        { icon: undefined, value: r.parent_name },
                        {
                          icon: <BadgeCheck size={11} />,
                          value: isMember
                            ? (child.plan_name ?? "Member")
                            : "No membership",
                          hideOnMobile: true,
                        },
                      ]}
                      action={
                        <div className="flex items-center gap-1.5 shrink-0">
                          <PhoneLinks
                            phone={r.phone}
                            secondaryPhone={r.secondary_phone}
                            className="p-1.5 rounded-full border border-brand-sky/30 bg-brand-sky/10 text-brand-skyLight hover:bg-brand-sky/15 transition-colors"
                          />
                          {child.currently_checked_in &&
                          child.active_session_id ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleCheckOut(
                                  r.customer_id,
                                  child.id,
                                  child.active_session_id!,
                                );
                              }}
                              disabled={checkinBusyId === child.id}
                              className="flex items-center gap-1 rounded-full border border-brand-coral/30 bg-brand-coral/10 px-2.5 py-1.5 text-[11px] font-semibold text-brand-coral hover:bg-brand-coral/15 transition-colors disabled:opacity-50"
                            >
                              <LogOut size={11} />
                              {checkinBusyId === child.id ? "…" : "Check out"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDurationPickerFor({
                                  customerId: r.customer_id,
                                  childId: child.id,
                                  childName: child.name,
                                });
                              }}
                              disabled={checkinBusyId === child.id}
                              className="flex items-center gap-1 rounded-full border border-brand-leaf/30 bg-brand-leaf/10 px-2.5 py-1.5 text-[11px] font-semibold text-brand-leaf hover:bg-brand-leaf/15 transition-colors disabled:opacity-50"
                            >
                              <LogIn size={11} />
                              {checkinBusyId === child.id ? "…" : "Check in"}
                            </button>
                          )}
                        </div>
                      }
                      expanded={isOpen}
                      onToggleExpand={() =>
                        setExpandedChildId(isOpen ? null : child.id)
                      }
                      expandedContent={
                        <div className="space-y-2.5">
                          {isAdmin && editingNames?.childId === child.id ? (
                            <div className="space-y-2 rounded-lg border border-brand-sky/20 bg-brand-sky/5 p-3">
                              <label className="block text-xs font-semibold text-brand-nightText/55">
                                Parent name
                                <input
                                  value={editingNames.parentName}
                                  onChange={(event) =>
                                    setEditingNames({
                                      ...editingNames,
                                      parentName: event.target.value,
                                    })
                                  }
                                  className="mt-1 w-full rounded-lg border border-white/15 bg-brand-nightSurface px-2.5 py-2 text-sm text-brand-nightText"
                                />
                              </label>
                              <label className="block text-xs font-semibold text-brand-nightText/55">
                                Child name
                                <input
                                  value={editingNames.childName}
                                  onChange={(event) =>
                                    setEditingNames({
                                      ...editingNames,
                                      childName: event.target.value,
                                    })
                                  }
                                  className="mt-1 w-full rounded-lg border border-white/15 bg-brand-nightSurface px-2.5 py-2 text-sm text-brand-nightText"
                                />
                              </label>
                              <label className="block text-xs font-semibold text-brand-nightText/55">
                                Date of birth
                                <input
                                  type="date"
                                  value={editingNames.dateOfBirth}
                                  max={today}
                                  onChange={(event) =>
                                    setEditingNames({
                                      ...editingNames,
                                      dateOfBirth: event.target.value,
                                    })
                                  }
                                  className="mt-1 w-full rounded-lg border border-white/15 bg-brand-nightSurface px-2.5 py-2 text-sm text-brand-nightText"
                                />
                              </label>
                              <label className="block text-xs font-semibold text-brand-nightText/55">
                                Location / address
                                <textarea
                                  value={editingNames.address}
                                  onChange={(event) =>
                                    setEditingNames({
                                      ...editingNames,
                                      address: event.target.value,
                                    })
                                  }
                                  rows={2}
                                  className="mt-1 w-full rounded-lg border border-white/15 bg-brand-nightSurface px-2.5 py-2 text-sm text-brand-nightText"
                                />
                              </label>
                              <label className="block text-xs font-semibold text-brand-nightText/55">
                                Allergies
                                <textarea
                                  value={editingNames.allergies}
                                  onChange={(event) =>
                                    setEditingNames({
                                      ...editingNames,
                                      allergies: event.target.value,
                                    })
                                  }
                                  rows={2}
                                  className="mt-1 w-full rounded-lg border border-white/15 bg-brand-nightSurface px-2.5 py-2 text-sm text-brand-nightText"
                                />
                              </label>
                              <label className="block text-xs font-semibold text-brand-nightText/55">
                                Medical conditions
                                <textarea
                                  value={editingNames.medicalConditions}
                                  onChange={(event) =>
                                    setEditingNames({
                                      ...editingNames,
                                      medicalConditions: event.target.value,
                                    })
                                  }
                                  rows={2}
                                  className="mt-1 w-full rounded-lg border border-white/15 bg-brand-nightSurface px-2.5 py-2 text-sm text-brand-nightText"
                                />
                              </label>
                              <label className="block text-xs font-semibold text-brand-nightText/55">
                                Special instructions
                                <textarea
                                  value={editingNames.specialInstructions}
                                  onChange={(event) =>
                                    setEditingNames({
                                      ...editingNames,
                                      specialInstructions: event.target.value,
                                    })
                                  }
                                  rows={2}
                                  className="mt-1 w-full rounded-lg border border-white/15 bg-brand-nightSurface px-2.5 py-2 text-sm text-brand-nightText"
                                />
                              </label>
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => void handleSaveNames()}
                                  disabled={savingNames}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-leaf disabled:opacity-50"
                                >
                                  <Check size={13} />
                                  {savingNames ? "Saving…" : "Save details"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingNames(null)}
                                  className="text-xs font-semibold text-brand-nightText/45"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDeleteCustomer(
                                      r.customer_id,
                                      r.parent_name,
                                    )
                                  }
                                  disabled={deletingCustomer}
                                  className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-coral disabled:opacity-50"
                                >
                                  {deletingCustomer
                                    ? "Removing…"
                                    : "Remove customer"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-brand-nightText/50">
                              <span className="flex items-center gap-2">
                                {r.parent_name}
                                <PhoneLinks
                                  phone={r.phone}
                                  secondaryPhone={r.secondary_phone}
                                  className="text-brand-sky hover:underline"
                                  showNumber
                                />
                              </span>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void beginEditDetails(r.customer_id, child)
                                  }
                                  className="inline-flex items-center gap-1 text-brand-sky hover:text-brand-skyLight"
                                >
                                  <Pencil size={12} /> Edit names
                                </button>
                              )}
                            </div>
                          )}
                          {isAdmin &&
                          editingNames?.childId === child.id ? null : (
                            <p className="text-xs text-brand-nightText/50">
                              {isMember
                                ? `Member · ${child.plan_name ?? "Active plan"}${
                                    child.subscription_expires_on
                                      ? ` · until ${new Date(
                                          child.subscription_expires_on +
                                            "T00:00:00",
                                        ).toLocaleDateString("en-IN", {
                                          day: "numeric",
                                          month: "short",
                                        })}`
                                      : ""
                                  }`
                                : "No membership on file"}
                            </p>
                          )}

                          {hasMedicalInfo(child) && (
                            <div className="rounded-lg bg-brand-coral/8 border border-brand-coral/20 px-3 py-2">
                              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-coral uppercase tracking-wide mb-1">
                                <Heart size={11} fill="currentColor" /> Medical
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
                          )}

                          {isAdmin && (
                            <p className="text-[11px] text-brand-nightText/35">
                              To activate or renew this child's membership, use
                              the Memberships tab.
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              toggleHistory(r.customer_id, child.id)
                            }
                            className="min-h-[36px] rounded-lg bg-brand-sky px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-sky/90"
                          >
                            {historyLoadingChild === child.id
                              ? "Loading history…"
                              : history
                                ? "Hide history"
                                : "View visit history"}
                          </button>

                          {history && (
                            <div className="rounded-xl border border-white/10 bg-brand-nightSurface2/70 p-3.5">
                              {history.length === 0 ? (
                                <p className="text-sm text-brand-nightText/40">
                                  No visits recorded yet.
                                </p>
                              ) : (
                                <div className="space-y-2.5">
                                  {history.map((entry, index) => (
                                    <div
                                      key={`${entry.visit_day}-${index}`}
                                      className="rounded-lg bg-brand-nightSurface p-2.5"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-brand-nightText/50">
                                          {new Date(
                                            entry.visit_day,
                                          ).toLocaleDateString("en-IN", {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                          })}
                                        </span>
                                        <span className="text-[10px] text-brand-nightText/35">
                                          {entry.status === "active"
                                            ? "Currently active"
                                            : entry.status === "completed"
                                              ? "Completed"
                                              : entry.status === "expired"
                                                ? "Expired"
                                                : entry.status}
                                        </span>
                                      </div>
                                      <p className="text-xs text-brand-nightText/60 mt-1">
                                        {formatTimeIST(entry.checked_in_at)}
                                        {entry.checked_out_at
                                          ? ` – ${formatTimeIST(entry.checked_out_at)}`
                                          : " – still checked in"}
                                        {entry.actual_duration_mins !== null &&
                                          ` · ${entry.actual_duration_mins} min`}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {durationPickerFor && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose visit duration"
        >
          <div className="w-full max-w-sm rounded-2xl bg-brand-nightSurface p-5 shadow-xl">
            <p className="font-bold text-brand-nightText">
              Check in {durationPickerFor.childName}
            </p>
            <p className="text-sm text-brand-nightText/50 mt-1 mb-4">
              Choose the planned visit length.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "1 hour", value: 60 },
                { label: "2 hours", value: 120 },
                { label: "Unlimited", value: null },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() =>
                    void handleCheckIn(
                      durationPickerFor.customerId,
                      durationPickerFor.childId,
                      option.value,
                    )
                  }
                  className="min-h-[52px] rounded-xl bg-brand-leaf text-white text-sm font-semibold"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDurationPickerFor(null)}
              className="w-full min-h-[44px] mt-2 rounded-xl bg-white/8 text-sm font-semibold text-brand-nightText"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
