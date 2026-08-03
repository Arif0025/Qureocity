"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";
import BirthDateDial from "./BirthDateDial";

type ChildDraft = { name: string; dateOfBirth: string };

function defaultDOB(yearsAgo: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - yearsAgo);
  return date.toISOString().slice(0, 10);
}

const MAX_CHILDREN = 10;

export default function NewCustomerForm({
  phone,
  onRegistered,
  onError,
}: {
  phone: string;
  onRegistered: (
    customerId: string,
    parentName: string,
    children: { id: string; name: string; age: number }[],
  ) => void;
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const [parentName, setParentName] = useState("");
  const [kids, setKids] = useState<ChildDraft[]>([
    { name: "", dateOfBirth: defaultDOB(5) },
  ]);
  const [submitting, setSubmitting] = useState(false);
  // NOTE: real child ids come back from checkin_register, so the parent
  // flows straight into duration selection with everyone pre-selected —
  // no redundant re-pick step for a family that just entered themselves.

  const updateKid = (i: number, patch: Partial<ChildDraft>) => {
    setKids((prev) =>
      prev.map((k, idx) => (idx === i ? { ...k, ...patch } : k)),
    );
  };

  const addKid = () => {
    if (kids.length >= MAX_CHILDREN) return;
    setKids((prev) => [...prev, { name: "", dateOfBirth: defaultDOB(5) }]);
  };

  const removeKid = (i: number) => {
    setKids((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    if (!parentName.trim()) return onError("Please enter your name.");
    if (kids.some((k) => !k.name.trim()))
      return onError("Please enter a name for each child.");

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("checkin_register", {
        p_phone: phone,
        p_parent_name: parentName.trim(),
        p_children: kids.map((k) => ({
          name: k.name.trim(),
          date_of_birth: k.dateOfBirth,
        })),
        p_client_key: getClientKey(),
      });
      if (error) throw error;

      onRegistered(data.customer_id, parentName.trim(), data.children ?? []);
    } catch (e: any) {
      onError(e.message ?? "Couldn't register. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl2 shadow-sm p-6">
      <h1 className="text-xl font-bold text-brand-ink mb-1">
        First time here?
      </h1>
      <p className="text-brand-ink/60 mb-6 text-sm">
        Let's get you set up — just takes a moment.
      </p>

      <label className="block text-sm font-medium text-brand-ink/60 mb-1">
        Your name
      </label>
      <input
        value={parentName}
        onChange={(e) => setParentName(e.target.value)}
        placeholder="Parent / guardian name"
        className="w-full min-h-[56px] rounded-xl2 border-2 border-brand-ink/10 focus:border-brand-sky focus:outline-none px-4 mb-6 text-lg"
      />

      <p className="text-sm font-medium text-brand-ink/60 mb-2">
        Children playing today
      </p>
      <div className="space-y-3 mb-3">
        {kids.map((kid, i) => (
          <div key={i} className="rounded-xl2 border-2 border-brand-ink/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                value={kid.name}
                onChange={(e) => updateKid(i, { name: e.target.value })}
                placeholder={`Child ${i + 1} name`}
                className="flex-1 min-h-[48px] rounded-xl border border-brand-ink/10 px-3"
              />
              {kids.length > 1 && (
                <button
                  onClick={() => removeKid(i)}
                  aria-label="Remove child"
                  className="min-h-[48px] min-w-[48px] rounded-xl text-brand-coral font-bold"
                >
                  ✕
                </button>
              )}
            </div>
            <BirthDateDial
              value={kid.dateOfBirth}
              onChange={(dateOfBirth) => updateKid(i, { dateOfBirth })}
            />
          </div>
        ))}
      </div>

      {kids.length < MAX_CHILDREN && (
        <button
          onClick={addKid}
          className="w-full min-h-[48px] rounded-xl2 border-2 border-dashed border-brand-sky/40 text-brand-sky font-semibold mb-6"
        >
          + Add another child
        </button>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full min-h-[56px] rounded-xl2 bg-brand-sun text-brand-purpleDeep font-bold text-lg disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
      >
        {submitting ? "Setting up…" : "Continue"}
      </button>
    </div>
  );
}
