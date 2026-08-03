"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Shift = {
  id: string;
  employee_id: string;
  start_time: string;
  end_time: string;
  notes: string | null;
};

export default function ShiftEditor({
  employeeId,
  currentShift,
  onSaved,
  onClose,
}: {
  employeeId: string;
  currentShift: Shift | null;
  onSaved: (shift: Shift) => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [startTime, setStartTime] = useState(
    currentShift?.start_time.slice(0, 5) ?? "09:00",
  );
  const [endTime, setEndTime] = useState(
    currentShift?.end_time.slice(0, 5) ?? "17:00",
  );
  const [notes, setNotes] = useState(currentShift?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (endTime <= startTime) {
      setError("End time must be after start time.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("shifts")
      .upsert(
        {
          employee_id: employeeId,
          start_time: startTime,
          end_time: endTime,
          notes: notes.trim() || null,
        },
        { onConflict: "employee_id" },
      )
      .select("id, employee_id, start_time, end_time, notes")
      .single();
    setSaving(false);
    if (error) return setError(error.message);
    onSaved(data as Shift);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-brand-nightSurface2/50 p-4">
      <p className="text-sm font-semibold text-brand-nightText mb-3">
        Change shift
      </p>
      {error && <p className="text-brand-coral text-xs mb-2">{error}</p>}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-brand-nightText/50 mb-1">
            Start
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface text-brand-nightText px-3 text-sm [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-nightText/50 mb-1">
            End
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface text-brand-nightText px-3 text-sm [color-scheme:dark]"
          />
        </div>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface text-brand-nightText px-3 text-sm mb-3"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 min-h-[38px] rounded-lg bg-brand-sky text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onClose}
          className="min-h-[38px] px-4 rounded-lg border border-white/15 text-brand-nightText/60 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
