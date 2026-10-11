"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search,
  Heart,
  BadgeCheck,
  LogIn,
  LogOut,
  Pencil,
  Check,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST, istDateParts } from "@/lib/formatTime";
import { todayISTDateString } from "@/lib/istTime";
import { getClientKey } from "@/lib/clientKey";
import PillSelect from "./PillSelect";
import ListRow from "./ListRow";
import PhoneLinks from "./PhoneLinks";
import MessageButton from "./MessageButton";
import AddMembershipButton from "./AddMembershipButton";

type ChildInfo = {
  id: string;
  name: string;
  date_of_birth?: string;
  age: number;
  plan_id?: string | null;
  special_plan_ids?: string[];
  subscription_active: boolean;
  subscription_started_on: string | null;
  subscription_expires_on: string | null;
  plan_name: string | null;
  max_visits?: number | null;
  visits_used?: number;
  allergies?: string | null;
  medical_conditions?: string | null;
  special_instructions?: string | null;
  currently_checked_in: boolean;
  active_session_id: string | null;
};

type ChildDetails = {
  date_of_birth: string;
  address: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  special_instructions: string | null;
};

function hasMedicalInfo(c: ChildDetails | ChildInfo): boolean {
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

const DIRECTORY_PAGE_SIZE = 30;

export default function CustomerSearch({
  isAdmin = false,
  initialQuery = "",
  initialPlanId = "",
  showFilters = true,
  focusCustomerPhone,
  focusChildId,
  filterNewThisMonth = false,
  membersOnly = false,
  filterExpiringSoon = false,
  filterExpired = false,
  browseAll = false,
}: {
  isAdmin?: boolean;
  initialQuery?: string;
  initialPlanId?: string;
  showFilters?: boolean;
  focusCustomerPhone?: string | null;
  focusChildId?: string | null;
  filterNewThisMonth?: boolean;
  // Customers' "Active members" filter — restricts to customers with at least
  // one child on an active, unexpired subscription.
  membersOnly?: boolean;
  // Deep-linked from Overview's "Expiring" card — a child's membership
  // ends within 7 days (matches the window MonthlyStatsCard already
  // uses for "expiring_next_7_days").
  filterExpiringSoon?: boolean;
  filterExpired?: boolean;
  browseAll?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Result[]>([]);
  const [loadingResults, setLoadingResults] = useState(
    () => initialQuery.trim().length >= 2 || !!initialPlanId || filterNewThisMonth || filterExpiringSoon || filterExpired || membersOnly || browseAll,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newOnly, setNewOnly] = useState(filterNewThisMonth);
  const [membershipFilter, setMembershipFilter] = useState<"active" | "expiring" | "expired" | null>(() =>
    filterExpired ? "expired" : filterExpiringSoon ? "expiring" : membersOnly ? "active" : null,
  );
  const [hasBrowsed, setHasBrowsed] = useState(
    () => initialQuery.trim().length >= 2 || !!initialPlanId || filterNewThisMonth || filterExpiringSoon || filterExpired || membersOnly || browseAll,
  );
  const [filtersDirty, setFiltersDirty] = useState(false);
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);
  const [historyByChild, setHistoryByChild] = useState<
    Record<string, VisitHistoryEntry[]>
  >({});
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());
  const [historyLoadingChild, setHistoryLoadingChild] = useState<string | null>(
    null,
  );
  const [detailsByChild, setDetailsByChild] = useState<Record<string, ChildDetails>>({});
  const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set());
  const [detailsErrors, setDetailsErrors] = useState<Record<string, string>>({});
  const detailsCacheRef = useRef(new Map<string, ChildDetails>());
  const detailsRequestsRef = useRef(new Map<string, Promise<ChildDetails | null>>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const today = todayISTDateString();
  const [planFilter, setPlanFilter] = useState(initialPlanId);
  const [planOptions, setPlanOptions] = useState<
    { id: string; name: string; plan_type: "recurring" | "special" }[]
  >([]);
  const planOptionsRequestedRef = useRef(false);
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

  const loadChildDetails = useCallback(async (customerId: string, childId: string) => {
    const cached = detailsCacheRef.current.get(childId);
    if (cached) return cached;
    const pending = detailsRequestsRef.current.get(childId);
    if (pending) return pending;

    setDetailsLoading((current) => new Set(current).add(childId));
    setDetailsErrors((current) => {
      const next = { ...current };
      delete next[childId];
      return next;
    });
    const request = (async () => {
      try {
        const { data, error } = await supabase.rpc("directory_child_details", {
          p_customer_id: customerId,
          p_child_id: childId,
        });
        if (error) throw error;
        if (!data) throw new Error("Details are unavailable for this child.");
        const details = data as ChildDetails;
        detailsCacheRef.current.set(childId, details);
        setDetailsByChild((current) => ({ ...current, [childId]: details }));
        return details;
      } catch (error) {
        setDetailsErrors((current) => ({
          ...current,
          [childId]: error instanceof Error ? error.message : "Could not load details.",
        }));
        return null;
      } finally {
        detailsRequestsRef.current.delete(childId);
        setDetailsLoading((current) => {
          const next = new Set(current);
          next.delete(childId);
          return next;
        });
      }
    })();
    detailsRequestsRef.current.set(childId, request);
    return request;
  }, [supabase]);

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
    const childData = await loadChildDetails(customerId, child.id);
    if (!childData) return;
    setEditingNames({
      customerId,
      childId: child.id,
      parentName:
        results.find((result) => result.customer_id === customerId)
          ?.parent_name ?? "",
      childName: child.name,
      dateOfBirth: childData.date_of_birth,
      address: childData.address ?? "",
      allergies: childData.allergies ?? "",
      medicalConditions: childData.medical_conditions ?? "",
      specialInstructions: childData.special_instructions ?? "",
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
    const savedDetails: ChildDetails = {
      date_of_birth: editingNames.dateOfBirth,
      address: editingNames.address.trim() || null,
      allergies: editingNames.allergies.trim() || null,
      medical_conditions: editingNames.medicalConditions.trim() || null,
      special_instructions: editingNames.specialInstructions.trim() || null,
    };
    detailsCacheRef.current.set(editingNames.childId, savedDetails);
    setDetailsByChild((current) => ({ ...current, [editingNames.childId]: savedDetails }));
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

  const loadPlanOptions = useCallback(async () => {
    if (planOptionsRequestedRef.current) return;
    planOptionsRequestedRef.current = true;
    const { data, error } = await supabase
      .from("membership_plans")
      .select("id, name, plan_type")
      .order("plan_type", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      planOptionsRequestedRef.current = false;
      return;
    }
    setPlanOptions(data ?? []);
  }, [supabase]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const loadPage = useCallback(async (offset = 0, append = false) => {
    const requestId = ++requestIdRef.current;
    setLoadError(null);
    if (append) setLoadingMore(true);
    else setLoadingResults(true);

    const venueToday = todayISTDateString();
    const cutoff = new Date(`${venueToday}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() + 7);
    const todayParts = istDateParts(new Date().toISOString());
    const monthStart = new Date(
      Date.UTC(todayParts.year, todayParts.month, 1) - 330 * 60_000,
    ).toISOString();

    const rpcName = membershipFilter === "expired"
      ? "directory_browse_expired_customers_with_plans"
      : "directory_browse_customers_with_plans";
    const rpcArgs = membershipFilter === "expired"
      ? {
          p_query: query.trim().length >= 2 ? query.trim() : null,
          p_limit: DIRECTORY_PAGE_SIZE,
          p_offset: offset,
        }
      : {
      p_query: query.trim().length >= 2 ? query.trim() : null,
      p_plan_id: planFilter || null,
      p_members_only: membersOnly,
      p_created_since: newOnly ? monthStart : null,
      p_expiring_before: membershipFilter === "expiring" ? cutoff.toISOString().slice(0, 10) : null,
      p_on_site_first: onSiteFirst,
      p_limit: DIRECTORY_PAGE_SIZE,
      p_offset: offset,
      };
    const { data, error } = await supabase.rpc(rpcName, rpcArgs);

    if (requestId !== requestIdRef.current) return;
    setLoadingResults(false);
    setLoadingMore(false);
    if (error) {
      setLoadError(error.message);
      if (!append) setResults([]);
      setHasMore(false);
      return;
    }
    const pageRows = (data as Result[]) ?? [];
    setResults((current) => append ? [...current, ...pageRows] : pageRows);
    setHasMore(pageRows.length === DIRECTORY_PAGE_SIZE);
  }, [supabase, query, planFilter, membersOnly, newOnly, membershipFilter, onSiteFirst]);

  // One request path handles both initial browse and search. A response
  // for an older query/filter is ignored as soon as a newer one starts.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    const hasSearchTerm = query.trim().length >= 2;
    if (!hasSearchTerm && (!hasBrowsed || filtersDirty)) {
      setLoadingResults(false);
      setLoadingMore(false);
      if (!hasBrowsed) {
        setResults([]);
        setHasMore(false);
      }
      return;
    }
    debounceRef.current = setTimeout(() => { void loadPage(0, false); }, query.trim().length >= 2 ? 280 : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestIdRef.current += 1;
    };
  }, [loadPage, query, hasBrowsed, filtersDirty]);

  const refetch = useCallback(() => loadPage(0, false), [loadPage]);

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
      } else {
        setOpenHistory((current) => {
          const next = new Set(current);
          next.delete(childId);
          return next;
        });
      }
    },
    [supabase],
  );

  const toggleHistory = async (customerId: string, childId: string) => {
    const isOpen = openHistory.has(childId);
    setOpenHistory((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(childId);
      else next.add(childId);
      return next;
    });
    if (isOpen || Object.prototype.hasOwnProperty.call(historyByChild, childId)) {
      return;
    }
    await loadHistory(customerId, childId);
  };

  useEffect(() => {
    if (!focusCustomerPhone) return;
    const match = results.find((r) => r.phone === focusCustomerPhone);
    const focusedChild = match?.children?.find((child) => child.id === focusChildId) ?? match?.children?.[0];
    if (!match || !focusedChild) return;
    setExpandedChildId(focusedChild.id);
    void loadChildDetails(match.customer_id, focusedChild.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCustomerPhone, focusChildId, results]);

  const loading = loadingResults;
  const displayedResults = results;

  return (
    <div>
      <div className="relative mb-4">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-nightText/30"
        />
        <input
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            if (value.trim().length >= 2) setFiltersDirty(false);
          }}
          placeholder="Search by parent name, child's name, or phone number…"
          className="w-full min-h-[52px] rounded-xl2 border-2 border-white/15 focus:border-brand-sky bg-brand-nightSurface2 text-brand-nightText pl-11 pr-4 text-base"
        />
      </div>

      {(membersOnly || filterExpiringSoon || filterExpired) && (
        <div className="mb-4 rounded-2xl border border-white/[0.08] bg-brand-nightSurface p-3">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-brand-nightText/45">Membership status</p>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Filter memberships by status">
            {([
              ["active", "Active"],
              ["expiring", "Expiring soon"],
              ["expired", "Expired"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={membershipFilter === value}
                onClick={() => { setMembershipFilter(value); setFiltersDirty(false); setHasBrowsed(true); setExpandedChildId(null); }}
                className={`min-h-10 rounded-xl border px-2 text-xs font-semibold transition-colors ${membershipFilter === value ? value === "expired" ? "border-brand-coral/45 bg-brand-coral/15 text-brand-coral" : value === "expiring" ? "border-brand-sun/45 bg-brand-sun/15 text-brand-sun" : "border-brand-leaf/45 bg-brand-leaf/15 text-brand-leaf" : "border-white/10 text-brand-nightText/50 hover:bg-white/[0.04]"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showFilters && <section className="mb-4 rounded-2xl border border-white/[0.08] bg-brand-nightSurface p-3 sm:p-4">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand-nightText/70">Filters</p>
          </div>
          {filtersDirty && query.trim().length < 2 && hasBrowsed && (
            <button type="button" onClick={() => setFiltersDirty(false)} className="min-h-9 rounded-lg bg-brand-sky px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-sky/90">Apply</button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PillSelect
            value={planFilter}
            onChange={(value) => { setPlanFilter(value); setFiltersDirty(true); }}
            onOpen={() => void loadPlanOptions()}
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
            onClick={() => { setNewOnly((v) => !v); setFiltersDirty(true); }}
            aria-pressed={newOnly}
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
            onClick={() => { setOnSiteFirst((v) => !v); setFiltersDirty(true); }}
            aria-pressed={onSiteFirst}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              onSiteFirst
                ? "border-brand-leaf/40 bg-brand-leaf/10 text-brand-leaf"
                : "border-white/15 text-brand-nightText/50"
            }`}
          >
            On site first
          </button>
        </div>
      </section>}

      {query.trim().length < 2 && !hasBrowsed && (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => { setFiltersDirty(false); setHasBrowsed(true); }}
            className="min-h-10 rounded-xl bg-brand-sky px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-sky/90">
            {filtersDirty ? "Apply filters" : "Browse customers"}
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-brand-nightText/40">Loading…</p>}

      {loadError && <p role="alert" className="mb-3 rounded-xl border border-brand-coral/25 bg-brand-coral/10 px-3.5 py-2.5 text-sm text-brand-coral">Could not load customer results: {loadError}</p>}

      {actionError && (
        <div className="mb-3 rounded-xl border border-brand-coral/30 bg-brand-coral/10 px-3.5 py-2.5 text-sm text-brand-coral">
          {actionError}
        </div>
      )}

      {!loading && !loadError && results.length === 0 && (query.trim().length >= 2 || (hasBrowsed && !filtersDirty)) && (
        <p className="text-sm text-brand-nightText/40">No customers match these filters.</p>
      )}

      <div className="space-y-3">
        {displayedResults.map((r) => {
          const kids = r.children ?? [];
          const childHasActivePlan = (child: ChildInfo) =>
            child.subscription_active &&
            (!child.subscription_expires_on || child.subscription_expires_on >= today);
          const visibleKids = planFilter
            ? kids.filter((child) => child.plan_id === planFilter || child.special_plan_ids?.includes(planFilter))
            : membersOnly && membershipFilter !== "expired" ? kids.filter(childHasActivePlan) : kids;
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
                {visibleKids.map((child) => {
                  const isMember = childHasActivePlan(child);
                  const isSelectedSpecialPass = !!planFilter && !!child.special_plan_ids?.includes(planFilter);
                  const siblings = kids.filter((sibling) => sibling.id !== child.id);
                  const isOpen = expandedChildId === child.id;
                  const history = historyByChild[child.id];
                  const historyIsOpen = openHistory.has(child.id);
                  const childDetails = detailsByChild[child.id];

                  return (
                    <ListRow
                      key={child.id}
                      title={<>{child.name}<span className="ml-1 text-xs font-medium text-brand-nightText/45">{child.age}y</span></>}
                      titleClassName="text-[15px]"
                      subtitle={r.parent_name}
                      statusDot={child.currently_checked_in ? "sky" : isMember ? "leaf" : "directoryGeneral"}
                      facts={[
                        { icon: <BadgeCheck size={11} />, value: <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${isSelectedSpecialPass ? "bg-brand-sun/10 text-brand-sun" : isMember ? "bg-brand-leaf/10 text-brand-leaf" : child.plan_name ? "bg-brand-sun/10 text-brand-sun" : "bg-white/[0.06] text-brand-nightText/45"}`}>{isSelectedSpecialPass ? "Special pass" : isMember ? child.plan_name ?? "Member" : child.plan_name ? child.subscription_expires_on && child.subscription_expires_on < today ? "Expired" : "Past plan" : "No plan"}</span> },
                        ...(child.currently_checked_in ? [{ icon: undefined, value: <span className="rounded-full bg-brand-sky/10 px-2 py-1 text-[10px] font-bold uppercase text-brand-skyLight">On site</span> }] : []),
                      ]}
                      factsLayout="right"
                      expanded={isOpen}
                      onToggleExpand={() => {
                        setExpandedChildId(isOpen ? null : child.id);
                        if (!isOpen) void loadChildDetails(r.customer_id, child.id);
                      }}
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
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-brand-nightText/60">
                              <span className="font-semibold text-brand-nightText/80">{r.parent_name}</span>
                              <PhoneLinks
                                phone={r.phone}
                                secondaryPhone={r.secondary_phone}
                                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-brand-sky/25 bg-brand-sky/10 px-2.5 text-xs font-semibold text-brand-skyLight"
                                showNumber
                                showCallButton
                              />
                              <MessageButton phone={r.phone} parentName={r.parent_name} childName={child.name} canManageTemplates={isAdmin} />
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
                                  }${
                                    child.max_visits != null
                                      ? ` · ${Math.max(child.max_visits - (child.visits_used ?? 0), 0)} of ${child.max_visits} visits left`
                                      : ""
                                  }`
                                : child.plan_name
                                  ? `${child.subscription_expires_on && child.subscription_expires_on < today ? "Expired" : "Past plan"} · ${child.plan_name}${child.subscription_expires_on ? ` · ended ${new Date(child.subscription_expires_on + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}`
                                  : "No membership on file"}
                            </p>
                          )}
                          {isAdmin && (
                            <AddMembershipButton
                              childId={child.id}
                              childName={child.name}
                              onApplied={refetch}
                            />
                          )}

                          <section className="rounded-xl border border-brand-sky/15 bg-brand-sky/[0.04] p-3">
                            <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-nightText/40">
                              <Users size={12} className="text-brand-skyLight" /> Family
                            </h3>
                            {siblings.length ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {siblings.map((sibling) => {
                                  const siblingIsMember = childHasActivePlan(sibling);
                                  return (
                                    <span key={sibling.id} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-brand-nightSurface px-2 py-1 text-xs text-brand-nightText/70">
                                      {sibling.name}
                                      <span className={`h-1.5 w-1.5 rounded-full ${siblingIsMember ? "bg-brand-leaf" : "bg-brand-nightText/25"}`} />
                                      <span className="text-[10px] text-brand-nightText/40">{siblingIsMember ? "Member" : sibling.plan_name ? "Past plan" : "No plan"}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            ) : <p className="mt-1.5 text-xs text-brand-nightText/50">No other children on this family record.</p>}
                          </section>
                          {detailsLoading.has(child.id) && !childDetails && (
                            <p className="text-xs text-brand-nightText/40">Loading private details…</p>
                          )}
                          {detailsErrors[child.id] && (
                            <button type="button" onClick={() => void loadChildDetails(r.customer_id, child.id)} className="text-xs font-medium text-brand-coral hover:underline">
                              {detailsErrors[child.id]} · Retry
                            </button>
                          )}
                          {childDetails?.date_of_birth && (
                            <p className="text-xs text-brand-nightText/50">Date of birth: {new Date(`${childDetails.date_of_birth}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                          )}
                          {childDetails?.address && (
                            <p className="text-xs text-brand-nightText/50">Address: {childDetails.address}</p>
                          )}
                          {childDetails && hasMedicalInfo(childDetails) && (
                            <div className="rounded-lg bg-brand-coral/8 border border-brand-coral/20 px-3 py-2">
                              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-coral uppercase tracking-wide mb-1">
                                <Heart size={11} fill="currentColor" /> Medical
                              </p>
                              {childDetails.allergies && (
                                <p className="text-xs text-brand-nightText/70">
                                  Allergies: {childDetails.allergies}
                                </p>
                              )}
                              {childDetails.medical_conditions && (
                                <p className="text-xs text-brand-nightText/70">
                                  Conditions: {childDetails.medical_conditions}
                                </p>
                              )}
                              {childDetails.special_instructions && (
                                <p className="text-xs text-brand-nightText/70">
                                  Notes: {childDetails.special_instructions}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => toggleHistory(r.customer_id, child.id)} className="min-h-[36px] rounded-lg bg-brand-sky px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-sky/90">
                            {historyLoadingChild === child.id ? "Loading history…" : historyIsOpen ? "Hide history" : "View visit history"}
                            </button>
                            {child.currently_checked_in && child.active_session_id ? (
                              <button type="button" onClick={() => void handleCheckOut(r.customer_id, child.id, child.active_session_id!)} disabled={checkinBusyId === child.id} className="flex min-h-9 items-center gap-1 rounded-lg border border-brand-coral/30 bg-brand-coral/10 px-3 text-xs font-semibold text-brand-coral disabled:opacity-50"><LogOut size={12} />{checkinBusyId === child.id ? "…" : "Check out"}</button>
                            ) : (
                              <button type="button" onClick={() => setDurationPickerFor({ customerId: r.customer_id, childId: child.id, childName: child.name })} disabled={checkinBusyId === child.id} className="flex min-h-9 items-center gap-1 rounded-lg border border-brand-leaf/30 bg-brand-leaf/10 px-3 text-xs font-semibold text-brand-leaf disabled:opacity-50"><LogIn size={12} />{checkinBusyId === child.id ? "…" : "Check in"}</button>
                            )}
                            {isAdmin && <button type="button" onClick={() => void beginEditDetails(r.customer_id, child)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-sky/25 bg-brand-sky/10 px-3 text-xs font-semibold text-brand-skyLight transition-colors hover:bg-brand-sky/15"><Pencil size={13} /> Edit details</button>}
                          </div>

                          {historyIsOpen && history && (
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

      {hasMore && <div className="flex justify-center py-5">
        <button type="button" onClick={() => void loadPage(results.length, true)} disabled={loadingMore}
          className="min-h-10 rounded-xl border border-white/10 bg-brand-nightSurface px-5 text-sm font-semibold text-brand-nightText/70 transition-colors hover:border-brand-sky/30 hover:text-brand-skyLight disabled:opacity-50">
          {loadingMore ? "Loading more…" : "Load more"}
        </button>
      </div>}

      {durationPickerFor && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkin-duration-title"
          aria-describedby="checkin-duration-description"
        >
          <div className="w-full max-w-sm rounded-2xl bg-brand-nightSurface p-5 shadow-xl">
            <h2 id="checkin-duration-title" className="font-bold text-brand-nightText">
              Check in {durationPickerFor.childName}
            </h2>
            <p id="checkin-duration-description" className="text-sm text-brand-nightText/50 mt-1 mb-4">
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
