"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Staff = { id: string; name: string; role: string };
type Shift = {
  id: string;
  employee_id: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  employees: { name: string } | null;
};

export default function ShiftsManager({
  staff,
  initialShifts,
}: {
  staff: Staff[];
  initialShifts: Shift[];
}) {
  const supabase = createClient();
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);
  const [employeeId, setEmployeeId] = useState(staff[0]?.id ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loads the currently-selected employee's existing shift into the form,
  // so editing feels like "change their shift" rather than "add another one".
  const handleSelectEmployee = (id: string) => {
    setEmployeeId(id);
    const existing = shifts.find((s) => s.employee_id === id);
    setStartTime(existing?.start_time.slice(0, 5) ?? "09:00");
    setEndTime(existing?.end_time.slice(0, 5) ?? "17:00");
    setNotes(existing?.notes ?? "");
  };

  const handleSave = async () => {
    if (!employeeId) return setError("Select an employee.");
    if (endTime <= startTime)
      return setError("End time must be after start time.");

    setSaving(true);
    setError(null);
    // Upsert on employee_id: this is what makes it "stays the same until
    // changed" rather than piling up a new row every time.
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
      .select("id, employee_id, start_time, end_time, notes, employees(name)")
      .single();
    setSaving(false);

    if (error) return setError(error.message);

    setShifts((prev) => {
      const withoutThis = prev.filter((s) => s.employee_id !== employeeId);
      return [...withoutThis, data as any].sort((a, b) =>
        (a.employees?.name ?? "").localeCompare(b.employees?.name ?? ""),
      );
    });
  };

  const handleDelete = async (id: string, employeeIdToRemove: string) => {
    if (!confirm("Remove this shift assignment?")) return;
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    if (error) return alert(error.message);
    setShifts((prev) => prev.filter((s) => s.id !== id));
    if (employeeIdToRemove === employeeId) {
      setStartTime("09:00");
      setEndTime("17:00");
      setNotes("");
    }
  };

  const handleChange = (shift: Shift) => {
    setEmployeeId(shift.employee_id);
    setStartTime(shift.start_time.slice(0, 5));
    setEndTime(shift.end_time.slice(0, 5));
    setNotes(shift.notes ?? "");
    setError(null);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl border border-black/5 p-5">
        <p className="font-semibold text-brand-ink mb-1">Set a shift</p>
        <p className="text-xs text-brand-ink/40 mb-4">
          Stays in effect every day until you change it here.
        </p>

        {error && <p className="text-brand-coral text-sm mb-3">{error}</p>}

        <label className="block text-xs font-medium text-brand-ink/50 mb-1">
          Employee
        </label>
        <select
          value={employeeId}
          onChange={(e) => handleSelectEmployee(e.target.value)}
          className="w-full min-h-[44px] rounded-lg border border-black/10 px-3 mb-3"
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-brand-ink/50 mb-1">
              Start
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-black/10 px-3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-ink/50 mb-1">
              End
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-black/10 px-3"
            />
          </div>
        </div>

        <label className="block text-xs font-medium text-brand-ink/50 mb-1">
          Notes (optional)
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. covers front desk"
          className="w-full min-h-[44px] rounded-lg border border-black/10 px-3 mb-4"
        />

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full min-h-[44px] rounded-lg bg-brand-sky text-white font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save shift"}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 p-5">
        <p className="font-semibold text-brand-ink mb-4">Current shifts</p>
        {shifts.length === 0 ? (
          <p className="text-sm text-brand-ink/40">No shifts assigned yet.</p>
        ) : (
          <ul className="space-y-2">
            {shifts.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between text-sm border-b border-black/5 pb-2"
              >
                <div>
                  <p className="font-medium text-brand-ink">
                    {s.employees?.name ?? "—"}
                  </p>
                  <p className="text-brand-ink/40 text-xs">
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    {s.notes ? ` · ${s.notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleChange(s)}
                    className="text-brand-sky text-xs font-semibold"
                  >
                    Change
                  </button>
                  <button
                    onClick={() => handleDelete(s.id, s.employee_id)}
                    className="text-brand-coral text-xs font-semibold"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
