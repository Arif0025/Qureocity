"use client";

import { useState } from "react";
import { CalendarDays, Check, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function EditMembershipDatesButton({
  childId,
  childName,
  startedOn,
  expiresOn,
  maxVisits,
  visitsUsed,
  hasMembership,
  expired,
  onSaved,
}: {
  childId: string;
  childName: string;
  startedOn: string | null;
  expiresOn: string | null;
  maxVisits: number | null;
  visitsUsed: number;
  hasMembership: boolean;
  expired: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startedOn ?? "");
  const [end, setEnd] = useState(expiresOn ?? "");
  const [visitsRemaining, setVisitsRemaining] = useState(
    maxVisits == null ? "" : String(Math.max(maxVisits - visitsUsed, 0)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!start || !end) return setError("Choose both membership dates.");
    if (end < start) return setError("End date cannot be before the start date.");
    const remaining = maxVisits == null ? null : Number(visitsRemaining);
    if (maxVisits != null && (!visitsRemaining.trim() || !Number.isInteger(remaining) || remaining! < 0)) {
      return setError("Enter a whole number of visits remaining, 0 or more.");
    }
    setSaving(true);
    const { error: saveError } = await createClient().rpc("admin_update_child_membership_details", {
      p_child_id: childId,
      p_started_on: start,
      p_expires_on: end,
      p_visits_remaining: remaining,
    });
    setSaving(false);
    if (saveError) return setError(saveError.message);
    setOpen(false);
    onSaved();
  };

  return (
    <div>
      <button type="button" disabled={!hasMembership} title={!hasMembership ? "No membership found. Add a plan first." : undefined} onClick={() => {
        if (!open) {
          setStart(startedOn ?? "");
          setEnd(expiresOn ?? "");
          setVisitsRemaining(maxVisits == null ? "" : String(Math.max(maxVisits - visitsUsed, 0)));
          setError(null);
        }
        setOpen((value) => !value);
      }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-sky/25 bg-brand-sky/10 px-3 text-xs font-semibold text-brand-skyLight hover:bg-brand-sky/15 disabled:cursor-not-allowed disabled:opacity-45">
        <Pencil size={12} /> {hasMembership ? "Edit membership details" : "No membership to edit"}
      </button>
      {open && (
        <div className="mt-2 grid gap-2 rounded-xl border border-brand-sky/20 bg-brand-sky/[0.05] p-3 sm:grid-cols-2">
          {expired && <p className="rounded-lg border border-brand-sun/20 bg-brand-sun/[0.07] px-3 py-2 text-xs text-brand-sun sm:col-span-2">This membership is expired. Updating its dates or remaining visits can restore it if both limits are valid.</p>}
          <label className="text-[11px] font-semibold text-brand-nightText/55">
            Start date
            <input aria-label={`${childName} membership start date`} type="date" value={start} onChange={(event) => setStart(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-white/15 bg-brand-nightSurface px-2 text-sm text-brand-nightText" />
          </label>
          <label className="text-[11px] font-semibold text-brand-nightText/55">
            End date
            <input aria-label={`${childName} membership end date`} type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-white/15 bg-brand-nightSurface px-2 text-sm text-brand-nightText" />
          </label>
          {maxVisits != null && (
            <label className="text-[11px] font-semibold text-brand-nightText/55">
              Visits remaining
              <input aria-label={`${childName} visits remaining`} type="number" min={0} step={1} value={visitsRemaining} onChange={(event) => setVisitsRemaining(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-white/15 bg-brand-nightSurface px-2 text-sm text-brand-nightText" />
            </label>
          )}
          <p className="flex items-center gap-1 text-[11px] text-brand-nightText/40 sm:col-span-2"><CalendarDays size={11} /> Membership expires when the end date passes or its visit allowance runs out.</p>
          {maxVisits != null && <p className="text-[11px] text-brand-nightText/40 sm:col-span-2">Current limit: {maxVisits} visits. Increasing the remaining count raises this child’s limit as needed.</p>}
          {error && <p role="alert" className="text-xs text-brand-coral sm:col-span-2">{error}</p>}
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-sky px-3 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2">
            <Check size={13} /> {saving ? "Saving…" : "Save membership"}
          </button>
        </div>
      )}
      {!hasMembership && <p className="mt-1 text-[11px] text-brand-nightText/40">Add a membership plan first to edit membership details.</p>}
    </div>
  );
}
