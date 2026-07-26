"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";

type Child = { id: string; name: string; age: number };

export default function ReturningCustomer({
  customerId,
  parentName,
  children,
  onConfirmed,
  onError,
  defaultSelectedIds,
}: {
  customerId: string;
  parentName: string;
  children: Child[];
  onConfirmed: (sessions: { session_id: string; end_time: string | null }[]) => void;
  onError: (msg: string) => void;
  defaultSelectedIds?: string[];
}) {
  const supabase = createClient();
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelectedIds ?? []));
  const [duration, setDuration] = useState<number | null>(60);
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0) {
      onError("Select at least one child playing today.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("checkin_create_sessions", {
        p_customer_id: customerId,
        p_child_ids: Array.from(selected),
        p_duration_mins: duration,
        p_client_key: getClientKey(),
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
        {defaultSelectedIds ? "Welcome" : "Welcome back"}, {parentName.split(" ")[0]}!
      </h1>

      <p className="text-sm font-medium text-brand-ink/60 mb-2">Who's playing today?</p>
      <div className="space-y-3 mb-6">
        {children.map((child) => {
          const isSelected = selected.has(child.id);
          return (
            <button
              key={child.id}
              onClick={() => toggle(child.id)}
              className={`w-full flex items-center justify-between rounded-xl2 border-2 px-5 py-4 min-h-[64px] text-left transition-colors ${
                isSelected
                  ? "border-brand-sky bg-brand-sky/10"
                  : "border-brand-ink/10 bg-white"
              }`}
            >
              <span>
                <span className="block font-semibold text-brand-ink">{child.name}</span>
                <span className="block text-sm text-brand-ink/50">{child.age} yrs</span>
              </span>
              <span
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${
                  isSelected ? "border-brand-sky bg-brand-sky" : "border-brand-ink/20"
                }`}
              >
                {isSelected && <span className="text-white text-sm">✓</span>}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-sm font-medium text-brand-ink/60 mb-2">Duration</p>
      <div className="grid grid-cols-3 gap-2 mb-6">
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
        onClick={handleConfirm}
        disabled={submitting}
        className="w-full min-h-[56px] rounded-xl2 bg-brand-sky text-white font-bold text-lg disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
      >
        {submitting ? "Checking in…" : "Check In"}
      </button>
    </div>
  );
}
