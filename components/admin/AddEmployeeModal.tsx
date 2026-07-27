"use client";

import { useState } from "react";
import { createEmployee } from "@/app/admin/actions";

export default function AddEmployeeModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    // A one-time temp password the employee changes on first login is
    // simpler and less error-prone than emailing invite links for a
    // small front-desk team — swap for Supabase's invite flow later
    // if the roster grows.
    const tempPassword = crypto.randomUUID().slice(0, 12);
    const result = await createEmployee({
      name,
      email,
      temporaryPassword: tempPassword,
      role,
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    alert(`Employee created. Temporary password: ${tempPassword}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl2 p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-brand-ink mb-4">Add employee</h2>

        {error && <p className="text-brand-coral text-sm mb-3">{error}</p>}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="w-full min-h-[48px] rounded-xl border border-brand-ink/10 px-3 mb-3"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          className="w-full min-h-[48px] rounded-xl border border-brand-ink/10 px-3 mb-3"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "staff" | "admin")}
          className="w-full min-h-[48px] rounded-xl border border-brand-ink/10 px-3 mb-4"
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 min-h-[48px] rounded-xl border border-brand-ink/10 text-brand-ink/60 font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name || !email}
            className="flex-1 min-h-[48px] rounded-xl bg-brand-sky text-white font-semibold disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
