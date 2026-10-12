"use client";

import { useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import PhoneLinks from "@/components/shared/PhoneLinks";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ArrowLeft,
  QrCode,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  Share2,
} from "lucide-react";
import SpecialPlanQrModal from "./SpecialPlanQrModal";
import PartyPlansManager from "./PartyPlansManager";
import Badge from "@/components/ui/Badge";
import { tapScale, DURATION, EASE } from "@/lib/motion";
import { planCardTone } from "./planCardTones";

// Same shared-element id on the browse card and the detail header below —
// Framer Motion morphs smoothly between them on tap instead of a hard
// screen cut, which is the "drill down" feel without rewriting the
// roster view's working logic to live inline.
const planCardLayoutId = (id: string) => `plan-card-${id}`;

type Plan = {
  id: string;
  name: string;
  description: string | null;
  plan_type: "recurring" | "special";
  event_date: string | null;
  event_dates: string[];
  code: string | null;
  validity_value: number;
  validity_unit: "days" | "weeks" | "months";
  hours_per_visit: number;
  max_visits: number | null;
  allowed_weekdays: number[];
  min_age: number | null;
  max_age: number | null;
  price: number;
  active: boolean;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type FormState = {
  name: string;
  description: string;
  plan_type: "recurring" | "special";
  event_date: string;
  event_dates: string[];
  code: string;
  validity_value: string;
  validity_unit: "days" | "weeks" | "months";
  hours_per_visit: string;
  max_visits: string;
  allowed_weekdays: number[];
  min_age: string;
  max_age: string;
  price: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  plan_type: "recurring",
  event_date: "",
  event_dates: [],
  code: "",
  validity_value: "1",
  validity_unit: "months",
  hours_per_visit: "2",
  max_visits: "",
  allowed_weekdays: [0, 1, 3, 4, 5, 6], // every open day by default (Tue closed)
  min_age: "",
  max_age: "",
  price: "",
  active: true,
};

function planToForm(p: Plan): FormState {
  return {
    name: p.name,
    description: p.description ?? "",
    plan_type: p.plan_type ?? "recurring",
    event_date: p.event_date ?? "",
    event_dates: p.event_dates?.length
      ? p.event_dates
      : p.event_date
        ? [p.event_date]
        : [],
    code: p.code ?? "",
    validity_value: String(p.validity_value),
    validity_unit: p.validity_unit,
    hours_per_visit: String(p.hours_per_visit),
    max_visits: p.max_visits != null ? String(p.max_visits) : "",
    allowed_weekdays: p.allowed_weekdays,
    min_age: p.min_age != null ? String(p.min_age) : "",
    max_age: p.max_age != null ? String(p.max_age) : "",
    price: String(p.price),
    active: p.active,
  };
}

type PlanMember = {
  pass_id?: string;
  child_id: string;
  child_name: string;
  age: number;
  gender?: string | null;
  school?: string | null;
  interests?: string[] | null;
  allergies?: string | null;
  medical_conditions?: string | null;
  special_instructions?: string | null;
  parent_name: string;
  phone: string;
  secondary_phone?: string | null;
  address?: string | null;
  started_on?: string | null;
  expires_on?: string | null;
  currently_active?: boolean;
  max_visits?: number | null;
  visits_used?: number;
  event_date?: string;
  purchased_at?: string;
  attendance_status?: "not_attended" | "on_site" | "attended";
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  receipt_number?: string | null;
};

type PlanRoster = {
  plan_id: string;
  plan_name: string;
  plan_type: "recurring" | "special";
  event_date: string | null;
  price: number;
  active: boolean;
  member_count: number;
  members: PlanMember[];
};

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthDate(value: string): Date {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export default function PlansManager({
  initialTypeFilter,
  initialExpandedPlanId,
}: {
  initialTypeFilter?: "recurring" | "special";
  initialExpandedPlanId?: string | null;
} = {}) {
  const reduceMotion = useReducedMotion();
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [roster, setRoster] = useState<Record<string, PlanRoster>>({});
  const [rosterLoading, setRosterLoading] = useState(!!initialExpandedPlanId);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    initialExpandedPlanId ?? null,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrPlan, setQrPlan] = useState<Plan | null>(null);
  const [unregisteringPassId, setUnregisteringPassId] = useState<string | null>(
    null,
  );
  const [expandedMemberKey, setExpandedMemberKey] = useState<string | null>(
    null,
  );
  const [viewType, setViewType] = useState<"recurring" | "special" | "party">(
    initialTypeFilter ?? "recurring",
  );
  const [calendarMonth, setCalendarMonth] = useState(() =>
    monthKey(new Date()),
  );

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("membership_plans")
      .select("*")
      .order("created_at", { ascending: false });
    setPlans((data as Plan[]) ?? []);
    setLoading(false);
  };

  const loadMemberCounts = async () => {
    const { data } = await supabase.rpc("admin_plan_member_counts");
    const counts: Record<string, number> = {};
    for (const row of (data as { plan_id: string; member_count: number }[]) ?? []) {
      counts[row.plan_id] = Number(row.member_count);
    }
    setMemberCounts(counts);
  };

  const loadRoster = async () => {
    setRosterLoading(true);
    const { data } = await supabase.rpc("admin_list_plan_members");
    const byId: Record<string, PlanRoster> = {};
    for (const row of (data as PlanRoster[]) ?? []) byId[row.plan_id] = row;
    setRoster(byId);
    setRosterLoading(false);
  };

  const unregisterFromSpecialDay = async (
    passId: string,
    childName: string,
  ) => {
    if (!confirm(`Remove ${childName} from this special day's roster?`)) return;
    setUnregisteringPassId(passId);
    const { error: err } = await supabase.rpc("admin_remove_special_pass", {
      p_pass_id: passId,
    });
    setUnregisteringPassId(null);
    if (err) {
      alert(`Couldn't remove: ${err.message}`);
      return;
    }
    void loadRoster();
    void loadMemberCounts();
  };

  useEffect(() => {
    void load();
    void loadMemberCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // This RPC returns full rosters and personal details. Defer it until a
  // plan roster is explicitly opened instead of loading every member on
  // every visit to the Plans tab.
  useEffect(() => {
    if (selectedPlanId) void loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId]);

  const visiblePlans = plans.filter((p) => p.plan_type === viewType);

  const startCreate = () => {
    setForm({ ...EMPTY_FORM, plan_type: viewType === "special" ? "special" : "recurring" });
    setCalendarMonth(monthKey(new Date()));
    setCreating(true);
    setEditingId(null);
  };

  const startEdit = (p: Plan) => {
    setForm(planToForm(p));
    const firstEventDate = p.event_dates?.[0] ?? p.event_date;
    setCalendarMonth(
      firstEventDate
        ? monthKey(new Date(`${firstEventDate}T00:00:00`))
        : monthKey(new Date()),
    );
    setEditingId(p.id);
    setCreating(false);
  };

  const cancel = () => {
    setCreating(false);
    setEditingId(null);
    setError(null);
  };

  const toggleWeekday = (day: number) => {
    setForm((f) => ({
      ...f,
      allowed_weekdays: f.allowed_weekdays.includes(day)
        ? f.allowed_weekdays.filter((d) => d !== day)
        : [...f.allowed_weekdays, day].sort(),
    }));
  };

  const toggleEventDate = (date: string) => {
    setForm((current) => ({
      ...current,
      event_dates: current.event_dates.includes(date)
        ? current.event_dates.filter((item) => item !== date)
        : [...current.event_dates, date].sort(),
    }));
  };

  const save = async () => {
    setError(null);
    if (!form.name.trim()) return setError("Name is required.");
    if (form.plan_type === "special") {
      const eventDates = [...new Set(form.event_dates.filter(Boolean))].sort();
      if (eventDates.length === 0)
        return setError("Pick at least one event date.");
      if (!form.code.trim())
        return setError(
          "Give this special day a short code (e.g. HAL) — it's used for receipt numbers and its sign-up link.",
        );
      if (!/^[A-Za-z0-9]{2,10}$/.test(form.code.trim()))
        return setError("Code must be 2–10 letters/numbers, no spaces.");
    } else if (form.allowed_weekdays.length === 0) {
      return setError("Select at least one allowed day.");
    }
    const eventWeekday = form.event_dates[0]
      ? new Date(form.event_dates[0] + "T00:00:00").getDay()
      : null;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      plan_type: form.plan_type,
      event_date: form.plan_type === "special" ? form.event_dates[0] : null,
      event_dates:
        form.plan_type === "special"
          ? [...new Set(form.event_dates.filter(Boolean))].sort()
          : [],
      code:
        form.plan_type === "special" ? form.code.trim().toUpperCase() : null,
      validity_value:
        form.plan_type === "special"
          ? 1
          : parseInt(form.validity_value, 10) || 1,
      validity_unit:
        form.plan_type === "special" ? "weeks" : form.validity_unit,
      hours_per_visit: parseFloat(form.hours_per_visit) || 1,
      max_visits:
        form.plan_type === "special"
          ? null
          : form.max_visits.trim()
            ? parseInt(form.max_visits, 10)
            : null,
      allowed_weekdays:
        form.plan_type === "special" && eventWeekday != null
          ? [eventWeekday]
          : form.allowed_weekdays,
      min_age: form.min_age ? parseInt(form.min_age, 10) : null,
      max_age: form.max_age ? parseInt(form.max_age, 10) : null,
      price: parseFloat(form.price) || 0,
      active: form.active,
    };
    setSaving(true);
    const { error: err } = editingId
      ? await supabase
          .from("membership_plans")
          .update(payload)
          .eq("id", editingId)
      : await supabase.from("membership_plans").insert(payload);
    setSaving(false);
    if (err) return setError(err.message);
    cancel();
    void load();
  };

  const remove = async (id: string) => {
    const plan = plans.find((p) => p.id === id);
    const memberCount = memberCounts[id] ?? 0;
    if (
      !confirm(
        memberCount > 0
          ? `Delete "${plan?.name ?? "this plan"}"? It still has ${memberCount} registered — if that fails, remove them from the roster first.`
          : `Delete "${plan?.name ?? "this plan"}"?`,
      )
    )
      return;
    const { error: err } = await supabase
      .from("membership_plans")
      .delete()
      .eq("id", id);
    if (err) {
      if (err.code === "23503") {
        alert(
          "This plan can't be deleted yet — it still has members on the roster, or a pending registration awaiting confirmation. Remove everyone from the roster (and confirm or discard any pending ones) first.",
        );
      } else {
        alert(`Couldn't delete: ${err.message}`);
      }
      return;
    }
    void load();
    void loadMemberCounts();
  };

  const toggleActive = async (p: Plan) => {
    await supabase
      .from("membership_plans")
      .update({ active: !p.active })
      .eq("id", p.id);
    void load();
  };

  const sharePlanLink = async (plan: Plan) => {
    if (!plan.code) return;
    const url = `${window.location.origin}/checkin/special/${plan.code.toLowerCase()}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: plan.name, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await navigator.clipboard?.writeText(url);
    setCopiedId(plan.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const isFormOpen = creating || editingId !== null;
  const selectedPlan = selectedPlanId
    ? (plans.find((plan) => plan.id === selectedPlanId) ?? null)
    : null;

  if (viewType === "party") {
    return <PartyPlansManager onModeChange={setViewType} />;
  }

  if (selectedPlan) {
    const members = roster[selectedPlan.id]?.members ?? [];
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.fast }}
        className="space-y-4"
      >
        <motion.button
          type="button"
          whileTap={tapScale}
          onClick={() => setSelectedPlanId(null)}
          className="flex items-center gap-1.5 text-sm font-semibold text-brand-nightText/55 hover:text-brand-sky transition-colors"
        >
          <ArrowLeft size={16} /> Back to plans
        </motion.button>
        <motion.div
          layoutId={planCardLayoutId(selectedPlan.id)}
          className="bg-brand-nightSurface rounded-xl2 border border-white/10 p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-brand-nightText">
                {selectedPlan.name}
              </p>
              <p className="text-sm text-brand-nightText/45 mt-1">
                {selectedPlan.plan_type === "special"
                  ? `Special day · ${selectedPlan.event_dates?.length ?? 0} date${selectedPlan.event_dates?.length === 1 ? "" : "s"}`
                  : "Monthly membership roster"}
              </p>
            </div>
            <Badge tone="info">
              {memberCounts[selectedPlan.id] ?? 0} registered
            </Badge>
          </div>
        </motion.div>

        {rosterLoading ? (
          <p className="text-sm text-brand-nightText/40">Loading roster…</p>
        ) : members.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-brand-nightSurface p-8 text-center text-sm text-brand-nightText/40">
            No one is registered on this plan yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-brand-nightSurface">
            <div className="hidden sm:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] gap-4 border-b border-white/10 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-brand-nightText/40">
              <span>Child</span>
              <span>Parent</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-white/8">
              {members.map((member) => {
                const isSpecial = selectedPlan.plan_type === "special";
                const attendance = member.attendance_status ?? "not_attended";
                const memberKey = member.pass_id ?? member.child_id;
                const isExpanded = expandedMemberKey === memberKey;
                const hasMedicalInfo =
                  member.allergies ||
                  member.medical_conditions ||
                  member.special_instructions;

                return (
                  <div
                    key={memberKey}
                    className="border-b border-white/8 last:border-b-0"
                  >
                    <div className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedMemberKey(isExpanded ? null : memberKey)
                        }
                        className="min-w-0 text-left"
                      >
                        <p className="font-semibold text-brand-nightText">
                          {member.child_name}{" "}
                          <span className="font-normal text-brand-nightText/40">
                            · {member.age}y
                          </span>
                        </p>
                        {isSpecial && member.checked_in_at && (
                          <p className="mt-0.5 text-xs text-brand-nightText/40">
                            Checked in{" "}
                            {new Date(member.checked_in_at).toLocaleTimeString(
                              "en-IN",
                              { hour: "numeric", minute: "2-digit" },
                            )}
                          </p>
                        )}
                      </button>

                      <div className="min-w-0">
                        <p className="text-sm text-brand-nightText/70 truncate">
                          {member.parent_name}
                        </p>
                        <PhoneLinks
                          phone={member.phone}
                          secondaryPhone={member.secondary_phone}
                          className="inline-flex items-center gap-1 text-xs text-brand-sky hover:underline"
                          showNumber
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                        {isSpecial ? (
                          <>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${attendance === "on_site" ? "bg-brand-leaf/15 text-brand-leaf" : attendance === "attended" ? "bg-brand-sky/15 text-brand-skyLight" : "bg-white/5 text-brand-nightText/45"}`}
                            >
                              {attendance === "on_site"
                                ? "On site"
                                : attendance === "attended"
                                  ? "Attended"
                                  : "Not attended"}
                            </span>
                            {member.pass_id && (
                              <button
                                type="button"
                                onClick={() =>
                                  unregisterFromSpecialDay(
                                    member.pass_id!,
                                    member.child_name,
                                  )
                                }
                                disabled={
                                  unregisteringPassId === member.pass_id
                                }
                                className="rounded-full px-2 py-1 text-[11px] font-semibold text-brand-coral/70 hover:text-brand-coral hover:bg-brand-coral/10 transition-colors disabled:opacity-50"
                              >
                                {unregisteringPassId === member.pass_id
                                  ? "…"
                                  : "Remove"}
                              </button>
                            )}
                          </>
                        ) : (
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${member.currently_active ? "bg-brand-leaf/10 text-brand-leaf" : "bg-white/5 text-brand-nightText/45"}`}
                          >
                            {member.currently_active
                              ? member.expires_on
                                ? `Active until ${formatDate(member.expires_on)}`
                                : "Active"
                              : "Expired"}
                            {member.max_visits != null &&
                              ` · ${Math.max(member.max_visits - (member.visits_used ?? 0), 0)} of ${member.max_visits} visits left`}
                          </span>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-4 pt-1 border-t border-white/8 bg-white/[0.02] space-y-3">
                        <div className="grid sm:grid-cols-2 gap-3 mt-3 text-sm">
                          <div>
                            <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mb-1">
                              Child
                            </p>
                            <p className="text-brand-nightText">
                              {member.child_name}
                              {member.gender ? ` · ${member.gender}` : ""}
                            </p>
                            {member.school && (
                              <p className="text-xs text-brand-nightText/50 mt-1">
                                School: {member.school}
                              </p>
                            )}
                            {member.interests &&
                              member.interests.length > 0 && (
                                <p className="text-xs text-brand-nightText/50 mt-1">
                                  Interests: {member.interests.join(", ")}
                                </p>
                              )}
                          </div>

                          <div>
                            <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mb-1">
                              Guardian
                            </p>
                            <p className="text-brand-nightText">
                              {member.parent_name}
                            </p>
                            <PhoneLinks
                              phone={member.phone}
                              secondaryPhone={member.secondary_phone}
                              className="flex items-center gap-1 text-xs text-brand-sky hover:underline mt-1 w-fit"
                              showNumber
                            />
                            {member.address && (
                              <p className="text-xs text-brand-nightText/50 mt-1">
                                {member.address}
                              </p>
                            )}
                          </div>
                        </div>

                        {(member.receipt_number ||
                          (member.expires_on && !isSpecial) ||
                          (member.event_date && isSpecial)) && (
                          <div className="text-xs text-brand-nightText/50">
                            {member.receipt_number && (
                              <p>Receipt: {member.receipt_number}</p>
                            )}
                            {!isSpecial && member.expires_on && (
                              <p>
                                Membership ends: {formatDate(member.expires_on)}
                              </p>
                            )}
                            {isSpecial && member.event_date && (
                              <p>Event: {formatDate(member.event_date)}</p>
                            )}
                          </div>
                        )}

                        {hasMedicalInfo && (
                          <div className="rounded-lg bg-brand-coral/8 border border-brand-coral/20 px-3 py-2.5">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-coral uppercase tracking-wide mb-1.5">
                              Medical
                            </p>
                            {member.allergies && (
                              <p className="text-xs text-brand-nightText/70">
                                Allergies: {member.allergies}
                              </p>
                            )}
                            {member.medical_conditions && (
                              <p className="text-xs text-brand-nightText/70">
                                Conditions: {member.medical_conditions}
                              </p>
                            )}
                            {member.special_instructions && (
                              <p className="text-xs text-brand-nightText/70">
                                Notes: {member.special_instructions}
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
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      {!isFormOpen && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1 rounded-xl2 bg-brand-nightSurface2 p-1">
            {(
              [
                { value: "recurring", label: "Monthly plans" },
                { value: "special", label: "Special days" },
                { value: "party", label: "Party plans" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setViewType(opt.value)}
                className={`text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors ${
                  viewType === opt.value
                    ? "bg-brand-sky text-white"
                    : "text-brand-nightText/50 hover:text-brand-nightText"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl2 bg-brand-sky text-white text-sm font-semibold hover:bg-brand-sky/90"
          >
            <Plus size={16} />
            New {viewType === "special" ? "special day" : "plan"}
          </button>
        </div>
      )}

      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: DURATION.base }}
            className="bg-brand-nightSurface rounded-xl2 border border-white/10 p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-brand-nightText">
                {editingId
                  ? `Edit ${editingId && form.plan_type === "special" ? "special day" : "plan"}`
                  : `New ${form.plan_type === "special" ? "special day" : "plan"}`}
              </p>
              <motion.button
                whileTap={tapScale}
                onClick={cancel}
                className="min-h-[32px] min-w-[32px] flex items-center justify-center text-brand-nightText/40 hover:text-brand-nightText rounded-lg"
              >
                <X size={16} />
              </motion.button>
            </div>

            <input
              placeholder="Plan name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
            />
            <textarea
              placeholder="Short description"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              className="w-full rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm p-3 resize-none"
            />

            <div>
              <label className="text-xs text-brand-nightText/50 block mb-1.5">
                Plan type
              </label>
              <div className="flex gap-1.5">
                {(
                  [
                    { value: "recurring", label: "Recurring membership" },
                    { value: "special", label: "Special day (one-off)" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, plan_type: opt.value }))
                    }
                    className={`flex-1 text-xs font-semibold px-2.5 py-2 rounded-lg border transition-colors ${
                      form.plan_type === opt.value
                        ? "bg-brand-sky text-white border-brand-sky"
                        : "bg-brand-nightSurface2 text-brand-nightText/50 border-white/15"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {form.plan_type === "special" && (
              <div>
                <label className="text-xs text-brand-nightText/50 block mb-1">
                  Event dates
                </label>
                <div className="max-w-[280px] mx-auto rounded-xl border border-white/10 bg-brand-nightSurface2 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <button
                      type="button"
                      onClick={() => {
                        const date = monthDate(calendarMonth);
                        date.setMonth(date.getMonth() - 1);
                        setCalendarMonth(monthKey(date));
                      }}
                      className="p-1 text-brand-nightText/50 hover:text-brand-nightText"
                      aria-label="Previous month"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <p className="text-xs font-semibold text-brand-nightText">
                      {monthDate(calendarMonth).toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const date = monthDate(calendarMonth);
                        date.setMonth(date.getMonth() + 1);
                        setCalendarMonth(monthKey(date));
                      }}
                      className="p-1 text-brand-nightText/50 hover:text-brand-nightText"
                      aria-label="Next month"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 text-center">
                    {WEEKDAY_LABELS.map((label) => (
                      <span
                        key={label}
                        className="text-[9px] font-semibold text-brand-nightText/35 py-0.5"
                      >
                        {label.slice(0, 2)}
                      </span>
                    ))}
                    {(() => {
                      const visibleMonth = monthDate(calendarMonth);
                      const year = visibleMonth.getFullYear();
                      const month = visibleMonth.getMonth();
                      const firstDay = new Date(year, month, 1).getDay();
                      const daysInMonth = new Date(
                        year,
                        month + 1,
                        0,
                      ).getDate();
                      const cells = [];
                      for (let index = 0; index < firstDay; index++) {
                        cells.push(<span key={`empty-${index}`} />);
                      }
                      for (let day = 1; day <= daysInMonth; day++) {
                        const date = dateKey(year, month, day);
                        const selected = form.event_dates.includes(date);
                        cells.push(
                          <button
                            key={date}
                            type="button"
                            onClick={() => toggleEventDate(date)}
                            aria-pressed={selected}
                            className={`aspect-square rounded-md text-[11px] font-semibold transition-colors ${selected ? "bg-brand-sky text-white" : "text-brand-nightText/65 hover:bg-brand-sky/15 hover:text-brand-nightText"}`}
                          >
                            {day}
                          </button>,
                        );
                      }
                      return cells;
                    })()}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {form.event_dates.length === 0 ? (
                    <span className="text-[11px] text-brand-nightText/35">
                      No dates selected
                    </span>
                  ) : (
                    form.event_dates.map((date) => (
                      <button
                        key={date}
                        type="button"
                        onClick={() => toggleEventDate(date)}
                        className="rounded-full bg-brand-sky/10 px-2 py-0.5 text-[10px] font-semibold text-brand-skyLight"
                      >
                        {formatDate(date)} ×
                      </button>
                    ))
                  )}
                </div>
                <p className="text-[11px] text-brand-nightText/35 mt-1">
                  Select any combination of dates. Each registration is for one
                  visit, claimed on the first check-in.
                </p>
              </div>
            )}

            {form.plan_type === "special" && (
              <div>
                <label className="text-xs text-brand-nightText/50 block mb-1">
                  Short code
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      code: e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, ""),
                    }))
                  }
                  placeholder="e.g. HAL"
                  maxLength={10}
                  className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3 uppercase tracking-wide"
                />
                <p className="text-[11px] text-brand-nightText/35 mt-1">
                  Used for this plan&apos;s receipt numbers ({form.code || "HAL"}
                  -001, {form.code || "HAL"}-002…) instead of the regular Q-
                  series, and as its sign-up link:
                  qureocity.vercel.app/checkin/special/
                  {form.code.toLowerCase() || "hal"}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {form.plan_type === "recurring" && (
                <div>
                  <label className="text-xs text-brand-nightText/50 block mb-1">
                    Validity
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={form.validity_value}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          validity_value: e.target.value,
                        }))
                      }
                      className="w-16 min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-2"
                    />
                    <select
                      value={form.validity_unit}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          validity_unit: e.target.value as
                            | "days"
                            | "weeks"
                            | "months",
                        }))
                      }
                      className="flex-1 min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-2"
                    >
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                      <option value="months">months</option>
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs text-brand-nightText/50 block mb-1">
                  Hours per visit
                </label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={form.hours_per_visit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hours_per_visit: e.target.value }))
                  }
                  className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
                />
              </div>
              {form.plan_type === "recurring" && (
                <div>
                  <label className="text-xs text-brand-nightText/50 block mb-1">
                    Visits allowed
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="Unlimited"
                    value={form.max_visits}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, max_visits: e.target.value }))
                    }
                    className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
                  />
                  <p className="text-[11px] text-brand-nightText/35 mt-1">
                    Leave blank for unlimited visits during the validity period.
                  </p>
                </div>
              )}
              <div>
                <label className="text-xs text-brand-nightText/50 block mb-1">
                  Age range
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={form.min_age}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, min_age: e.target.value }))
                    }
                    className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
                  />
                  <span className="text-brand-nightText/30 text-xs shrink-0">
                    to
                  </span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={form.max_age}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, max_age: e.target.value }))
                    }
                    className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-brand-nightText/50 block mb-1">
                  Price (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: e.target.value }))
                  }
                  className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
                />
              </div>
            </div>

            {form.plan_type === "recurring" && (
              <div>
                <label className="text-xs text-brand-nightText/50 block mb-1.5">
                  Allowed days — any combination
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_LABELS.map((label, day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleWeekday(day)}
                      disabled={day === 2}
                      title={day === 2 ? "Closed Tuesdays" : undefined}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-25 ${
                        form.allowed_weekdays.includes(day)
                          ? "bg-brand-sky text-white border-brand-sky"
                          : "bg-brand-nightSurface2 text-brand-nightText/50 border-white/15"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-brand-nightText/60">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((f) => ({ ...f, active: e.target.checked }))
                }
                className="accent-brand-sky w-4 h-4"
              />
              Active (shown on the registration form)
            </label>

            {error && <p className="text-sm text-brand-coral">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="min-h-[40px] px-4 rounded-xl2 bg-brand-sky text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save plan"}
              </button>
              <button
                onClick={cancel}
                className="min-h-[40px] px-4 rounded-xl2 border border-white/15 text-brand-nightText/50 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <p className="text-sm text-brand-nightText/40">Loading…</p>
      ) : visiblePlans.length === 0 ? (
        <p className="text-sm text-brand-nightText/40">
          {viewType === "special"
            ? "No special days yet — create one to get its sign-up link and receipt codes."
            : "No monthly plans yet — create one to make it available on the registration form."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {visiblePlans.map((p) => {
            const tone = planCardTone(p.id, plans.map((plan) => plan.id));
            return (
              <motion.div
                key={p.id}
                layoutId={planCardLayoutId(p.id)}
                layout="position"
                transition={{ layout: { duration: reduceMotion ? 0 : DURATION.base, ease: EASE } }}
                className={`w-full rounded-2xl border border-l-4 p-4 sm:p-5 transition-colors ${tone.stripe} ${tone.card} ${!p.active ? "opacity-65" : "hover:brightness-[1.03]"}`}
              >
                <button
                  type="button"
                  aria-expanded={expandedCardId === p.id}
                  aria-controls={`plan-details-${p.id}`}
                  onClick={() => setExpandedCardId((current) => current === p.id ? null : p.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-brand-nightText">{p.name}</p>
                      {p.plan_type === "special" && (
                        <Badge tone="warning">
                          {p.event_date
                            ? new Date(p.event_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                            : "Special day"}
                          {p.event_dates?.length > 1 ? ` +${p.event_dates.length - 1}` : ""}
                        </Badge>
                      )}
                      {!p.active && <Badge tone="neutral">Inactive</Badge>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-brand-nightText/55">
                      {p.description || (p.plan_type === "special" ? "Special day pass" : "Membership plan")}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-3 py-1.5 text-sm font-extrabold flex items-center gap-0.5 ${tone.badge}`}>
                      <IndianRupee size={13} />{p.price}
                    </span>
                    <ChevronDown size={16} className={`mt-1 text-brand-nightText/45 transition-transform duration-300 ease-out ${expandedCardId === p.id ? "rotate-180" : ""}`} />
                  </span>
                </button>

                <AnimatePresence initial={false}>
                {expandedCardId === p.id && (
                <motion.div
                  id={`plan-details-${p.id}`}
                  initial={reduceMotion ? false : { height: 0, opacity: 0, y: -4 }}
                  animate={{ height: "auto", opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -4 }}
                  transition={reduceMotion
                    ? { duration: 0 }
                    : { height: { duration: DURATION.base, ease: EASE }, opacity: { duration: DURATION.fast }, y: { duration: DURATION.base, ease: EASE } }}
                  className="overflow-hidden"
                >

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {p.plan_type === "special" ? (
                    <>
                      <PlanInfo label="Registered" value={String(memberCounts[p.id] ?? 0)} />
                      <PlanInfo label="Event dates" value={(p.event_dates?.length ? p.event_dates : p.event_date ? [p.event_date] : []).map(formatDate).join(", ") || "Date not set"} />
                      <PlanInfo label="Visit length" value={`${p.hours_per_visit} hours`} />
                      {(p.min_age != null || p.max_age != null) && <PlanInfo label="Age range" value={`${p.min_age ?? 0}–${p.max_age ?? "No limit"}`} />}
                    </>
                  ) : (
                    <>
                      <PlanInfo label="Registered" value={String(memberCounts[p.id] ?? 0)} />
                      <PlanInfo label="Membership length" value={`${p.validity_value} ${p.validity_unit}`} />
                      <PlanInfo label="Visit length" value={`${p.hours_per_visit} hours per visit`} />
                      <PlanInfo label="Visit limit" value={p.max_visits == null ? "Unlimited" : `${p.max_visits} visits`} />
                      {(p.min_age != null || p.max_age != null) && <PlanInfo label="Age range" value={`${p.min_age ?? 0}–${p.max_age ?? "No limit"}`} />}
                    </>
                  )}
                </div>

                {p.plan_type === "recurring" && (
                  <div className="mt-2 rounded-xl bg-white/[0.035] px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-brand-nightText/35">Available days</p>
                    <p className="mt-0.5 text-xs font-medium text-brand-nightText/65">
                      {p.allowed_weekdays.slice().sort().map((d) => WEEKDAY_LABELS[d]).join(", ")}
                    </p>
                  </div>
                )}

                {p.plan_type === "special" && p.code && (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/8 pt-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void sharePlanLink(p);
                      }}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-brand-sky/25 bg-brand-sky/10 px-2.5 text-xs font-bold text-brand-skyLight transition-colors hover:bg-brand-sky/15"
                    >
                      <Share2 size={15} />
                      {copiedId === p.id ? "Link copied" : "Share link"}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setQrPlan(p);
                      }}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-brand-sun/25 bg-brand-sun/10 px-2.5 text-xs font-bold text-brand-sun transition-colors hover:bg-brand-sun/15"
                    >
                      <QrCode size={15} /> Show QR
                    </button>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/8 pt-3">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleActive(p);
                    }}
                    className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-bold transition-colors ${p.active ? "border-brand-sun/25 bg-brand-sun/10 text-brand-sun hover:bg-brand-sun/15" : "border-brand-leaf/25 bg-brand-leaf/10 text-brand-leaf hover:bg-brand-leaf/15"}`}
                  >
                    {p.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      startEdit(p);
                    }}
                    aria-label="Edit plan"
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-brand-sky/25 bg-brand-sky/10 px-2 text-xs font-bold text-brand-skyLight transition-colors hover:bg-brand-sky/15"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(p.id);
                    }}
                    aria-label="Delete plan"
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-brand-coral/25 bg-brand-coral/10 px-2 text-xs font-bold text-brand-coral transition-colors hover:bg-brand-coral/15"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
                </motion.div>
                )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
      {qrPlan?.code && (
        <SpecialPlanQrModal
          name={qrPlan.name}
          code={qrPlan.code}
          onClose={() => setQrPlan(null)}
        />
      )}
    </div>
  );
}

function PlanInfo({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.035] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-brand-nightText/35">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-semibold text-brand-nightText/75">
        {icon}<span className="truncate">{value}</span>
      </p>
    </div>
  );
}
