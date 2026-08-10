"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Pencil, Trash2, X } from "lucide-react";

type Plan = {
  id: string;
  name: string;
  description: string | null;
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

export default function PlansManager() {
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("membership_plans")
      .select("*")
      .order("created_at", { ascending: false });
    setPlans((data as Plan[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCreate = () => {
    setForm(EMPTY_FORM);
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
    if (form.allowed_weekdays.length === 0)
      return setError("Select at least one allowed day.");
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      validity_value: parseInt(form.validity_value, 10) || 1,
      validity_unit: form.validity_unit,
      hours_per_visit: parseFloat(form.hours_per_visit) || 1,
      allowed_weekdays: form.allowed_weekdays,
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

  return (
    <div className="space-y-4">
      {!isFormOpen && (
        <button
          onClick={startCreate}
          className="flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl2 bg-brand-sky text-white text-sm font-semibold hover:bg-brand-sky/90"
        >
          <Plus size={16} />
          New plan
        </button>
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

          <div className="grid grid-cols-2 gap-3">
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
      ) : plans.length === 0 ? (
        <p className="text-sm text-brand-nightText/40">
          No plans yet — create one to make it available on the registration
          form.
        </p>
      ) : (
        <div className="space-y-2">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`bg-brand-nightSurface rounded-xl border border-white/10 p-4 ${!p.active ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-brand-nightText">{p.name}</p>
                  {p.description && (
                    <p className="text-xs text-brand-nightText/45 mt-0.5">
                      {p.description}
                    </p>
                  )}
                  <p className="text-xs text-brand-nightText/40 mt-1.5">
                    {p.validity_value} {p.validity_unit} · {p.hours_per_visit}
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
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(p)}
                    className="text-[11px] font-semibold text-brand-nightText/40 hover:text-brand-nightText px-2 py-1"
                  >
                    {p.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => startEdit(p)}
                    className="p-1.5 text-brand-nightText/40 hover:text-brand-sky"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => remove(p.id)}
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
