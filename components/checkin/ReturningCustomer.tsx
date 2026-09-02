"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";
import { todayISTDateString } from "@/lib/istTime";
import BirthDateDial from "./BirthDateDial";

type Child = {
  id: string;
  name: string;
  age: number;
  currently_checked_in?: boolean;
};

function defaultDOB(yearsAgo: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - yearsAgo);
  return date.toISOString().slice(0, 10);
}

export default function ReturningCustomer({
  customerId,
  parentName,
  children: initialChildren,
  onConfirmed,
  onError,
  defaultSelectedIds,
}: {
  customerId: string;
  parentName: string;
  children: Child[];
  onConfirmed: (
    sessions: {
      session_id: string;
      end_time: string | null;
      status?: string;
    }[],
  ) => void;
  onError: (msg: string) => void;
  defaultSelectedIds?: string[];
}) {
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>(initialChildren);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(defaultSelectedIds ?? []),
  );
  const [duration, setDuration] = useState<number | null>(60);
  const [historicalMode, setHistoricalMode] = useState(false);
  const [historicalDate, setHistoricalDate] = useState(todayISTDateString());
  const [historicalStart, setHistoricalStart] = useState("09:00");
  const [historicalEnd, setHistoricalEnd] = useState("11:00");
  const [submitting, setSubmitting] = useState(false);

  const [addingChild, setAddingChild] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const [newChildDateOfBirth, setNewChildDateOfBirth] = useState(defaultDOB(5));
  const [savingChild, setSavingChild] = useState(false);

  const toggle = (id: string, alreadyCheckedIn?: boolean) => {
    if (alreadyCheckedIn) return; // can't re-select a child who's already on the floor
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddChild = async () => {
    if (!newChildName.trim()) return onError("Please enter the child's name.");
    setSavingChild(true);
    try {
      const { data, error } = await supabase.rpc("checkin_add_child", {
        p_customer_id: customerId,
        p_name: newChildName.trim(),
        p_date_of_birth: newChildDateOfBirth,
        p_client_key: getClientKey(),
      });
      if (error) throw error;

      const newChild: Child = { id: data.id, name: data.name, age: data.age };
      setChildren((prev) => [...prev, newChild]);
      setSelected((prev) => new Set(prev).add(newChild.id)); // auto-select — they're obviously playing today
      setNewChildName("");
      setNewChildDateOfBirth(defaultDOB(5));
      setAddingChild(false);
    } catch (e: any) {
      onError(e.message ?? "Couldn't add child. Please try again.");
    } finally {
      setSavingChild(false);
    }
  };

  const handleConfirm = async () => {
    if (selected.size === 0) {
      onError("Select at least one child playing today.");
      return;
    }
    setSubmitting(true);
    try {
      const start = historicalMode
        ? new Date(`${historicalDate}T${historicalStart}:00+05:30`)
        : null;
      const end = historicalMode
        ? new Date(`${historicalDate}T${historicalEnd}:00+05:30`)
        : null;
      if (
        historicalMode &&
        (!start ||
          !end ||
          Number.isNaN(start.getTime()) ||
          Number.isNaN(end.getTime()))
      ) {
        throw new Error("Enter a valid date, start time, and end time.");
      }
      if (historicalMode && start && end && end <= start) {
        throw new Error("End time must be after start time.");
      }
      if (historicalMode && end && end > new Date()) {
        throw new Error("Historical check-in cannot be in the future.");
      }

      const { data, error } = historicalMode
        ? await supabase.rpc("checkin_create_historical_session", {
            p_customer_id: customerId,
            p_child_ids: Array.from(selected),
            p_started_at: start!.toISOString(),
            p_ended_at: end!.toISOString(),
            p_client_key: getClientKey(),
          })
        : await supabase.rpc("checkin_create_sessions", {
            p_customer_id: customerId,
            p_child_ids: Array.from(selected),
            p_duration_mins: duration,
            p_client_key: getClientKey(),
            p_status: "active",
          });
      if (error) throw error;
      onConfirmed(data.sessions);
    } catch (e: any) {
      onError(e.message ?? "Couldn't start the session. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl2 shadow-sm p-6">
      <h1 className="text-xl font-bold text-brand-ink mb-4">
        {defaultSelectedIds ? "Welcome" : "Welcome back"},{" "}
        {parentName.split(" ")[0]}!
      </h1>

      <p className="text-sm font-medium text-brand-ink/60 mb-2">
        Who's playing today?
      </p>
      <div className="space-y-3 mb-3">
        {children.map((child) => {
          const isSelected = selected.has(child.id);
          const alreadyIn = !!child.currently_checked_in;
          return (
            <button
              key={child.id}
              onClick={() => toggle(child.id, alreadyIn)}
              disabled={alreadyIn}
              className={`w-full flex items-center justify-between rounded-xl2 border-2 px-5 py-4 min-h-[64px] text-left transition-colors ${
                alreadyIn
                  ? "border-brand-leaf/30 bg-brand-leaf/5 cursor-not-allowed"
                  : isSelected
                    ? "border-brand-sky bg-brand-sky/10"
                    : "border-brand-ink/10 bg-white"
              }`}
            >
              <span>
                <span className="block font-semibold text-brand-ink">
                  {child.name}
                </span>
                <span className="block text-sm text-brand-ink/50">
                  {child.age} yrs
                </span>
              </span>
              {alreadyIn ? (
                <span className="text-xs font-semibold text-brand-leaf bg-brand-leaf/10 px-2 py-1 rounded-full">
                  Already checked in
                </span>
              ) : (
                <span
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${
                    isSelected
                      ? "border-brand-sky bg-brand-sky"
                      : "border-brand-ink/20"
                  }`}
                >
                  {isSelected && <span className="text-white text-sm">✓</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!addingChild && children.length < 10 && (
        <button
          onClick={() => setAddingChild(true)}
          className="w-full min-h-[44px] rounded-xl2 border-2 border-dashed border-brand-sky/40 text-brand-sky font-semibold mb-6 text-sm"
        >
          + Add a child not listed here
        </button>
      )}

      {addingChild && (
        <div className="rounded-xl2 border-2 border-brand-ink/10 p-4 mb-6">
          <input
            value={newChildName}
            onChange={(e) => setNewChildName(e.target.value)}
            placeholder="Child's name"
            className="w-full min-h-[48px] rounded-xl border border-brand-ink/10 px-3 mb-3"
          />
          <BirthDateDial
            value={newChildDateOfBirth}
            onChange={setNewChildDateOfBirth}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setAddingChild(false)}
              className="flex-1 min-h-[44px] rounded-xl border border-brand-ink/10 text-brand-ink/60 font-semibold text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleAddChild}
              disabled={savingChild}
              className="flex-1 min-h-[44px] rounded-xl bg-brand-sky text-white font-semibold text-sm disabled:opacity-50"
            >
              {savingChild ? "Adding…" : "Add child"}
            </button>
          </div>
        </div>
      )}

      {!historicalMode ? (
        <>
          <p className="text-sm font-medium text-brand-ink/60 mb-2">Duration</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "1 hour", value: 60 },
              { label: "2 hours", value: 120 },
              { label: "Unlimited", value: null },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setDuration(opt.value)}
                className={`min-h-[56px] rounded-xl2 border-2 font-semibold transition-colors ${
                  duration === opt.value
                    ? "border-brand-sun bg-brand-sun/20 text-brand-ink"
                    : "border-brand-ink/10 text-brand-ink/60"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setHistoricalMode(true)}
            className="mb-6 text-xs font-semibold text-brand-ink/40 hover:text-brand-sky"
          >
            Different date/time? Record a past walk-in
          </button>
        </>
      ) : (
        <div className="mb-6 rounded-xl2 border border-brand-sky/20 bg-brand-sky/5 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-brand-ink">Past walk-in</p>
            <button
              type="button"
              onClick={() => setHistoricalMode(false)}
              className="text-xs font-semibold text-brand-sky"
            >
              Use now
            </button>
          </div>
          <label className="block text-xs font-medium text-brand-ink/60 mb-2">
            Date
            <input
              type="date"
              value={historicalDate}
              max={todayISTDateString()}
              onChange={(event) => setHistoricalDate(event.target.value)}
              className="mt-1 w-full min-h-[44px] rounded-lg border border-brand-ink/10 px-3 [color-scheme:light]"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-brand-ink/60">
              Start time
              <input
                type="time"
                value={historicalStart}
                onChange={(event) => setHistoricalStart(event.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-lg border border-brand-ink/10 px-3"
              />
            </label>
            <label className="block text-xs font-medium text-brand-ink/60">
              End time
              <input
                type="time"
                value={historicalEnd}
                onChange={(event) => setHistoricalEnd(event.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-lg border border-brand-ink/10 px-3"
              />
            </label>
          </div>
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={submitting}
        className="w-full min-h-[56px] rounded-xl2 bg-brand-sky text-white font-bold text-lg disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
      >
        {submitting ? "Checking in…" : "Check In"}
      </button>
    </div>
  );
}
