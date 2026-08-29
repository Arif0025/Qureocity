"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ArrowLeft,
  Phone,
  Link as LinkIcon,
} from "lucide-react";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  plan_type: "recurring" | "special";
  event_date: string | null;
  code: string | null;
  validity_value: number;
  validity_unit: "weeks" | "months";
  hours_per_visit: number;
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
  code: string;
  validity_value: string;
  validity_unit: "weeks" | "months";
  hours_per_visit: string;
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
  code: "",
  validity_value: "1",
  validity_unit: "months",
  hours_per_visit: "2",
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
    code: p.code ?? "",
    validity_value: String(p.validity_value),
    validity_unit: p.validity_unit,
    hours_per_visit: String(p.hours_per_visit),
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
  parent_name: string;
  phone: string;
  started_on?: string | null;
  expires_on?: string | null;
  currently_active?: boolean;
  event_date?: string;
  purchased_at?: string;
  payment_status?: "pending" | "paid";
  attendance_status?: "not_attended" | "on_site" | "attended";
  checked_in_at?: string | null;
  checked_out_at?: string | null;
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

export default function PlansManager({
  initialTypeFilter,
  initialExpandedPlanId,
}: {
  initialTypeFilter?: "recurring" | "special";
  initialExpandedPlanId?: string | null;
} = {}) {
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roster, setRoster] = useState<Record<string, PlanRoster>>({});
  const [rosterLoading, setRosterLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    initialExpandedPlanId ?? null,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [togglingPassId, setTogglingPassId] = useState<string | null>(null);
  const [viewType, setViewType] = useState<"recurring" | "special">(
    initialTypeFilter ?? "recurring",
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

  const loadRoster = async () => {
    setRosterLoading(true);
    const { data } = await supabase.rpc("admin_list_plan_members");
    const byId: Record<string, PlanRoster> = {};
    for (const row of (data as PlanRoster[]) ?? []) byId[row.plan_id] = row;
    setRoster(byId);
    setRosterLoading(false);
  };

  const togglePaymentStatus = async (
    passId: string,
    current: PlanMember["payment_status"],
  ) => {
    setTogglingPassId(passId);
    const next = current === "paid" ? "pending" : "paid";
    await supabase.rpc("admin_set_special_pass_payment_status", {
      p_pass_id: passId,
      p_status: next,
    });
    await loadRoster();
    setTogglingPassId(null);
  };

  useEffect(() => {
    void load();
    void loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visiblePlans = plans.filter((p) => p.plan_type === viewType);

  const startCreate = () => {
    setForm({ ...EMPTY_FORM, plan_type: viewType });
    setCreating(true);
    setEditingId(null);
  };

  const startEdit = (p: Plan) => {
    setForm(planToForm(p));
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

  const save = async () => {
    setError(null);
    if (!form.name.trim()) return setError("Name is required.");
    if (form.plan_type === "special") {
      if (!form.event_date) return setError("Pick the special day's date.");
      if (!form.code.trim())
        return setError(
          "Give this special day a short code (e.g. HAL) — it's used for receipt numbers and its sign-up link.",
        );
      if (!/^[A-Za-z0-9]{2,10}$/.test(form.code.trim()))
        return setError("Code must be 2–10 letters/numbers, no spaces.");
    } else if (form.allowed_weekdays.length === 0) {
      return setError("Select at least one allowed day.");
    }
    const eventWeekday = form.event_date
      ? new Date(form.event_date + "T00:00:00").getDay()
      : null;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      plan_type: form.plan_type,
      event_date: form.plan_type === "special" ? form.event_date : null,
      code:
        form.plan_type === "special" ? form.code.trim().toUpperCase() : null,
      validity_value:
        form.plan_type === "special"
          ? 1
          : parseInt(form.validity_value, 10) || 1,
      validity_unit:
        form.plan_type === "special" ? "weeks" : form.validity_unit,
      hours_per_visit: parseFloat(form.hours_per_visit) || 1,
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
    if (
      !confirm(
        "Delete this plan? Existing registrations keep their history either way.",
      )
    )
      return;
    const { error: err } = await supabase
      .from("membership_plans")
      .delete()
      .eq("id", id);
    if (err) {
      alert(`Couldn't delete: ${err.message}`);
      return;
    }
    void load();
  };

  const toggleActive = async (p: Plan) => {
    await supabase
      .from("membership_plans")
      .update({ active: !p.active })
      .eq("id", p.id);
    void load();
  };

  const isFormOpen = creating || editingId !== null;
  const selectedPlan = selectedPlanId
    ? plans.find((plan) => plan.id === selectedPlanId) ?? null
    : null;

  if (selectedPlan) {
    const members = roster[selectedPlan.id]?.members ?? [];
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedPlanId(null)}
          className="flex items-center gap-1.5 text-sm font-semibold text-brand-nightText/55 hover:text-brand-sky transition-colors"
        >
          <ArrowLeft size={16} /> Back to plans
        </button>
        <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-brand-nightText">
                {selectedPlan.name}
              </p>
              <p className="text-sm text-brand-nightText/45 mt-1">
                {selectedPlan.plan_type === "special"
                  ? `Special day · ${selectedPlan.event_date ? formatDate(selectedPlan.event_date) : "Date not set"}`
                  : "Monthly membership roster"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-brand-sky/10 px-2.5 py-1 text-xs font-semibold text-brand-skyLight">
              {roster[selectedPlan.id]?.member_count ?? 0} registered
            </span>
          </div>
        </div>

        {rosterLoading ? (
          <p className="text-sm text-brand-nightText/40">Loading roster…</p>
        ) : members.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-brand-nightSurface p-8 text-center text-sm text-brand-nightText/40">
            No one is registered on this plan yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-brand-nightSurface">
            <div className="hidden sm:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] gap-4 border-b border-white/10 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-brand-nightText/40">
              <span>Child</span><span>Parent</span><span>Status</span>
            </div>
            <div className="divide-y divide-white/8">
              {members.map((member) => {
                const isSpecial = selectedPlan.plan_type === "special";
                const attendance = member.attendance_status ?? "not_attended";
                return (
                  <div key={member.pass_id ?? member.child_id} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-nightText">
                        {member.child_name} <span className="font-normal text-brand-nightText/40">· {member.age}y</span>
                      </p>
                      {isSpecial && member.checked_in_at && (
                        <p className="mt-0.5 text-xs text-brand-nightText/40">
                          Checked in {new Date(member.checked_in_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-brand-nightText/70 truncate">{member.parent_name}</p>
                      <a href={`tel:${member.phone}`} className="inline-flex items-center gap-1 text-xs text-brand-sky hover:underline">
                        <Phone size={11} /> {member.phone}
                      </a>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      {isSpecial ? (
                        <>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${attendance === "on_site" ? "bg-brand-leaf/15 text-brand-leaf" : attendance === "attended" ? "bg-brand-sky/15 text-brand-skyLight" : "bg-white/5 text-brand-nightText/45"}`}>
                            {attendance === "on_site" ? "On site" : attendance === "attended" ? "Attended" : "Not attended"}
                          </span>
                          {member.pass_id && (
                            <button
                              type="button"
                              onClick={() => togglePaymentStatus(member.pass_id!, member.payment_status)}
                              disabled={togglingPassId === member.pass_id}
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${member.payment_status === "paid" ? "bg-brand-leaf/10 text-brand-leaf" : "bg-brand-coral/10 text-brand-coral"}`}
                            >
                              {togglingPassId === member.pass_id ? "…" : member.payment_status === "paid" ? "Paid" : "Payment pending"}
                            </button>
                          )}
                        </>
                      ) : (
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${member.currently_active ? "bg-brand-leaf/10 text-brand-leaf" : "bg-white/5 text-brand-nightText/45"}`}>
                          {member.currently_active ? (member.expires_on ? `Active until ${formatDate(member.expires_on)}` : "Active") : "Expired"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
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

      {isFormOpen && (
        <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-nightText">
              {editingId ? "Edit plan" : "New plan"}
            </p>
            <button onClick={cancel} className="text-brand-nightText/40">
              <X size={16} />
            </button>
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
                Event date
              </label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, event_date: e.target.value }))
                }
                className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
              />
              <p className="text-[11px] text-brand-nightText/35 mt-1">
                Anyone who registers or renews with this plan will show up in
                Quick Check-In automatically on this date.
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
                Used for this plan's receipt numbers ({form.code || "HAL"}-001,{" "}
                {form.code || "HAL"}-002…) instead of the regular Q- series, and
                as its sign-up link: qureocity.vercel.app/checkin/special/
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
                      setForm((f) => ({ ...f, validity_value: e.target.value }))
                    }
                    className="w-16 min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-2"
                  />
                  <select
                    value={form.validity_unit}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        validity_unit: e.target.value as "weeks" | "months",
                      }))
                    }
                    className="flex-1 min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-2"
                  >
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
        </div>
      )}

      {loading ? (
        <p className="text-sm text-brand-nightText/40">Loading…</p>
      ) : visiblePlans.length === 0 ? (
        <p className="text-sm text-brand-nightText/40">
          {viewType === "special"
            ? "No special days yet — create one to get its sign-up link and receipt codes."
            : "No monthly plans yet — create one to make it available on the registration form."}
        </p>
      ) : (
        <div className="space-y-2">
          {visiblePlans.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedPlanId(p.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setSelectedPlanId(p.id);
              }}
              className={`bg-brand-nightSurface rounded-xl border border-white/10 p-4 ${!p.active ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-brand-nightText">
                      {p.name}
                    </p>
                    {p.plan_type === "special" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-sun bg-brand-sun/10 rounded-full px-2 py-0.5 shrink-0">
                        Special day
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs text-brand-nightText/45 mt-0.5">
                      {p.description}
                    </p>
                  )}
                  {p.plan_type === "special" ? (
                    <>
                      <p className="text-xs text-brand-nightText/40 mt-1.5">
                        {p.event_date
                          ? new Date(
                              p.event_date + "T00:00:00",
                            ).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "No date set"}{" "}
                        · {p.hours_per_visit} hrs · ₹{p.price}
                        {(p.min_age != null || p.max_age != null) &&
                          ` · Age ${p.min_age ?? "0"}–${p.max_age ?? "∞"}`}
                      </p>
                      {p.code && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <code className="text-[11px] font-mono text-brand-sky bg-brand-sky/10 rounded px-1.5 py-0.5">
                            {p.code}-###
                          </code>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              const url = `${window.location.origin}/checkin/special/${p.code!.toLowerCase()}`;
                              navigator.clipboard?.writeText(url);
                              setCopiedId(p.id);
                              setTimeout(() => setCopiedId(null), 1500);
                            }}
                            className="text-[11px] font-semibold text-brand-nightText/40 hover:text-brand-sky flex items-center gap-1"
                          >
                            <LinkIcon size={11} />
                            {copiedId === p.id
                              ? "Link copied!"
                              : "Copy sign-up link"}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-brand-nightText/40 mt-1.5">
                        {p.validity_value} {p.validity_unit} ·{" "}
                        {p.hours_per_visit}
                        hrs/visit · ₹{p.price}
                        {(p.min_age != null || p.max_age != null) &&
                          ` · Age ${p.min_age ?? "0"}–${p.max_age ?? "∞"}`}
                      </p>
                      <p className="text-xs text-brand-nightText/35 mt-1">
                        {p.allowed_weekdays
                          .sort()
                          .map((d) => WEEKDAY_LABELS[d])
                          .join(", ")}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleActive(p);
                    }}
                    className="text-[11px] font-semibold text-brand-nightText/40 hover:text-brand-nightText px-2 py-1"
                  >
                    {p.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      startEdit(p);
                    }}
                    className="p-1.5 text-brand-nightText/40 hover:text-brand-sky"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(p.id);
                    }}
                    className="p-1.5 text-brand-nightText/40 hover:text-brand-coral"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
