"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cake, ChevronDown, Clock3, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { tapScale, DURATION } from "@/lib/motion";
import PartyBookingSettingsCard from "./PartyBookingSettingsCard";

type PartyPlan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  kids_count: number;
  adults_count: number;
  includes_cake: boolean;
  includes_snacks: boolean;
  decorations_type: string | null;
  duration_minutes: number;
  area_type: "party_room" | "entire_play_area";
  active: boolean;
};

type FormValues = Omit<PartyPlan, "id">;
const EMPTY_FORM: FormValues = {
  name: "", description: "", price: 0, kids_count: 0, adults_count: 0,
  includes_cake: false, includes_snacks: false, decorations_type: "",
  duration_minutes: 60, area_type: "party_room", active: true,
};

const inputClass = "min-h-10 w-full rounded-lg border border-white/15 bg-brand-nightSurface2 px-3 text-sm text-brand-nightText placeholder:text-brand-nightText/30";

export default function PartyPlansManager({
  onModeChange,
}: {
  onModeChange: (mode: "recurring" | "special") => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [plans, setPlans] = useState<PartyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PartyPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingSettingsLoaded, setBookingSettingsLoaded] = useState(false);

  const load = async () => {
    setLoading(true);
    const planResult = await supabase.from("party_plans")
      .select("id, name, description, price, kids_count, adults_count, includes_cake, includes_snacks, decorations_type, duration_minutes, area_type, active")
      .order("active", { ascending: false }).order("created_at", { ascending: false });
    if (planResult.error) setError(planResult.error.message);
    else setPlans((planResult.data as PartyPlan[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setError(null); setForm(EMPTY_FORM); setEditing(null); setCreating(true);
  };

  const openEdit = (plan: PartyPlan) => {
    setError(null);
    setForm({ ...plan });
    setEditing(plan);
    setCreating(false);
    setExpandedId(plan.id);
  };

  const cancel = () => { setEditing(null); setCreating(false); setError(null); };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Plan name is required.");
    if (form.kids_count < 0 || form.adults_count < 0) return setError("Guest counts cannot be negative.");
    if (form.duration_minutes < 1) return setError("Time period must be at least one minute.");
    setSaving(true); setError(null);
    const payload = {
      ...form,
      name: form.name.trim(),
      description: form.description?.trim() || null,
      decorations_type: form.decorations_type?.trim() || null,
      price: Number(form.price),
      kids_count: Number(form.kids_count),
      adults_count: Number(form.adults_count),
      duration_minutes: Number(form.duration_minutes),
    };
    const result = editing
      ? await supabase.from("party_plans").update(payload).eq("id", editing.id)
      : await supabase.from("party_plans").insert(payload);
    setSaving(false);
    if (result.error) return setError(result.error.message);
    cancel();
    await load();
  };

  const toggleActive = async (plan: PartyPlan) => {
    const { error: updateError } = await supabase.from("party_plans").update({ active: !plan.active }).eq("id", plan.id);
    if (updateError) setError(updateError.message);
    else await load();
  };

  const remove = async (plan: PartyPlan) => {
    if (!window.confirm(`Delete party plan “${plan.name}”?`)) return;
    const { error: deleteError } = await supabase.from("party_plans").delete().eq("id", plan.id);
    if (deleteError) setError(deleteError.message);
    else { setExpandedId(null); await load(); }
  };

  const patch = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl2 bg-brand-nightSurface2 p-1">
          <button type="button" onClick={() => onModeChange("recurring")} className="rounded-lg px-3.5 py-2 text-sm font-semibold text-brand-nightText/50 hover:text-brand-nightText">Monthly plans</button>
          <button type="button" onClick={() => onModeChange("special")} className="rounded-lg px-3.5 py-2 text-sm font-semibold text-brand-nightText/50 hover:text-brand-nightText">Special days</button>
          <span aria-current="page" className="rounded-lg bg-brand-sky px-3.5 py-2 text-sm font-semibold text-white">Party plans</span>
        </div>
        {!creating && !editing && <motion.button type="button" whileTap={tapScale} onClick={openCreate} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl2 bg-brand-sky px-4 text-sm font-semibold text-white hover:bg-brand-sky/90"><Plus size={16} /> New party plan</motion.button>}
      </div>

      {(creating || editing) && (
        <form onSubmit={save} className="space-y-3.5 rounded-xl2 border border-white/10 bg-brand-nightSurface p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-brand-nightText">{editing ? "Edit party plan" : "New party plan"}</h3>
            <button type="button" onClick={cancel} aria-label="Close form" className="grid h-8 w-8 place-items-center rounded-lg text-brand-nightText/45 hover:bg-white/5"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-brand-nightText/55">Plan name<input required maxLength={100} className={inputClass} value={form.name} onChange={(e) => patch("name", e.target.value)} /></label>
            <label className="space-y-1 text-xs text-brand-nightText/55">Price (₹)<input required type="number" min="0" step="0.01" className={inputClass} value={form.price} onChange={(e) => patch("price", Number(e.target.value))} /></label>
            <label className="space-y-1 text-xs text-brand-nightText/55 sm:col-span-2">Description<textarea rows={2} className={`${inputClass} resize-y py-2`} value={form.description ?? ""} onChange={(e) => patch("description", e.target.value)} /></label>
            <label className="space-y-1 text-xs text-brand-nightText/55">Kids<input type="number" min="0" step="1" className={inputClass} value={form.kids_count} onChange={(e) => patch("kids_count", Number(e.target.value))} /></label>
            <label className="space-y-1 text-xs text-brand-nightText/55">Adults<input type="number" min="0" step="1" className={inputClass} value={form.adults_count} onChange={(e) => patch("adults_count", Number(e.target.value))} /></label>
            <label className="space-y-1 text-xs text-brand-nightText/55">Time period (minutes)<input type="number" min="1" step="1" className={inputClass} value={form.duration_minutes} onChange={(e) => patch("duration_minutes", Number(e.target.value))} /><span className="block text-[10px] text-brand-nightText/35">Any whole-minute duration is allowed.</span></label>
            <label className="space-y-1 text-xs text-brand-nightText/55">Area<select className={inputClass} value={form.area_type} onChange={(e) => patch("area_type", e.target.value as FormValues["area_type"])}><option value="party_room">Party room</option><option value="entire_play_area">Entire first floor</option></select></label>
            <label className="space-y-1 text-xs text-brand-nightText/55 sm:col-span-2">Decoration type / description<input className={inputClass} value={form.decorations_type ?? ""} onChange={(e) => patch("decorations_type", e.target.value)} placeholder="e.g. Jungle theme, balloons, table setup" /></label>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <label className="inline-flex items-center gap-2 text-sm text-brand-nightText/70"><input type="checkbox" checked={form.includes_cake} onChange={(e) => patch("includes_cake", e.target.checked)} /> Cake included</label>
            <label className="inline-flex items-center gap-2 text-sm text-brand-nightText/70"><input type="checkbox" checked={form.includes_snacks} onChange={(e) => patch("includes_snacks", e.target.checked)} /> Snacks included</label>
            <label className="inline-flex items-center gap-2 text-sm text-brand-nightText/70"><input type="checkbox" checked={form.active} onChange={(e) => patch("active", e.target.checked)} /> Available for booking</label>
          </div>
          {error && <p role="alert" className="text-sm text-brand-coral">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={cancel} className="min-h-10 rounded-lg border border-white/15 px-4 text-sm text-brand-nightText/65">Cancel</button><button disabled={saving} className="min-h-10 rounded-lg bg-brand-sky px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : editing ? "Save changes" : "Create party plan"}</button></div>
        </form>
      )}

      {error && !creating && !editing && <p role="alert" className="rounded-xl border border-brand-coral/20 bg-brand-coral/5 px-3 py-2 text-sm text-brand-coral">{error}</p>}
      {loading ? <p className="py-4 text-sm text-brand-nightText/40">Loading party plans…</p> : plans.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-brand-nightText/45">No party plans yet. Create a package to start accepting party bookings.</div> : (
        <div className="space-y-2.5">
          {plans.map((plan, index) => {
            const expanded = expandedId === plan.id;
            const tone = ["border-brand-sky/30 bg-brand-sky/[0.08]", "border-brand-leaf/35 bg-brand-leaf/[0.08]", "border-brand-coral/35 bg-brand-coral/[0.08]", "border-brand-sun/40 bg-brand-sun/[0.09]"][index % 4];
            return <motion.article layout key={plan.id} className={`overflow-hidden rounded-2xl border border-l-4 ${tone} ${plan.active ? "" : "opacity-65"}`}>
              <button type="button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : plan.id)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
                <span className="min-w-0"><span className="block font-bold text-brand-nightText">{plan.name}</span><span className="mt-0.5 line-clamp-2 block text-xs text-brand-nightText/55">{plan.description || "Party package"}</span></span>
                <span className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-extrabold text-brand-nightText">₹{Number(plan.price).toLocaleString("en-IN")}</span><ChevronDown size={16} className={`mt-1 text-brand-nightText/45 transition-transform ${expanded ? "rotate-180" : ""}`} /></span>
              </button>
              <AnimatePresence initial={false}>{expanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: DURATION.fast }} className="overflow-hidden"><div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4 sm:grid-cols-3">
                <Detail icon={<Users size={14} />} label="Guests" value={`${plan.kids_count} kids · ${plan.adults_count} adults`} />
                <Detail icon={<Clock3 size={14} />} label="Time period" value={`${plan.duration_minutes} minutes`} />
                <Detail icon={<Cake size={14} />} label="Cake" value={plan.includes_cake ? "Included" : "Not included"} />
                <Detail label="Snacks" value={plan.includes_snacks ? "Included" : "Not included"} />
                <Detail label="Area" value={plan.area_type === "entire_play_area" ? "Entire first floor" : "Party room"} />
                <Detail label="Decorations" value={plan.decorations_type || "Not specified"} />
                <Detail label="Booking status" value={plan.active ? "Available" : "Unavailable"} />
              </div><div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3"><button type="button" onClick={() => void toggleActive(plan)} className="min-h-9 rounded-lg border border-brand-sun/25 px-3 text-xs font-semibold text-brand-sun">{plan.active ? "Deactivate" : "Activate"}</button><button type="button" onClick={() => openEdit(plan)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-sky/25 px-3 text-xs font-semibold text-brand-skyLight"><Pencil size={13} /> Edit</button><button type="button" onClick={() => void remove(plan)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-coral/25 px-3 text-xs font-semibold text-brand-coral"><Trash2 size={13} /> Delete</button></div></motion.div>}</AnimatePresence>
            </motion.article>;
          })}
        </div>
      )}

      <details className="group rounded-2xl border border-white/10 bg-brand-nightSurface" onToggle={(event) => { if (event.currentTarget.open) setBookingSettingsLoaded(true); }}>
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-brand-nightText">Party booking settings</span><span className="mt-0.5 block text-xs text-brand-nightText/45">Booking hours and the gap between parties.</span></span>
          <ChevronDown size={17} className="shrink-0 text-brand-nightText/45 transition-transform group-open:rotate-180" />
        </summary>
        {bookingSettingsLoaded && <div className="border-t border-white/8 p-4"><PartyBookingSettingsCard /></div>}
      </details>
    </section>
  );
}

function Detail({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0 rounded-xl bg-white/[0.04] px-3 py-2"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-brand-nightText/40">{icon}{label}</p><p className="mt-1 break-words text-xs font-semibold text-brand-nightText/75">{value}</p></div>;
}
