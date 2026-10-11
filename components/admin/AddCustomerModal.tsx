"use client";

import { useMemo, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";

type ChildDraft = { name: string; dateOfBirth: string };

function initialDateOfBirth() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 5);
  return date.toISOString().slice(0, 10);
}

export default function AddCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (phone: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [children, setChildren] = useState<ChildDraft[]>([
    { name: "", dateOfBirth: initialDateOfBirth() },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const normalizedPhone = phone.trim();
    const phoneDigits = normalizedPhone.replace(/\D/g, "");
    if (!name.trim()) {
      setError("Enter the parent or guardian name.");
      return;
    }
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      setError("Enter a valid phone number.");
      return;
    }
    if (children.some((child) => !child.name.trim() || !child.dateOfBirth)) {
      setError("Enter each child’s name and date of birth.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: registrationError } = await supabase.rpc("checkin_register", {
      p_phone: normalizedPhone,
      p_parent_name: name.trim(),
      p_children: children.map((child) => ({
        name: child.name.trim(),
        date_of_birth: child.dateOfBirth,
      })),
      p_client_key: getClientKey(),
    });
    setBusy(false);
    if (registrationError) {
      setError(registrationError.message.includes("already registered")
        ? "This phone number is already registered. Search for the family instead."
        : registrationError.message);
      return;
    }
    if (!data?.customer_id) {
      setError("The customer could not be created. Please try again.");
      return;
    }
    onCreated(normalizedPhone);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="add-customer-title" aria-describedby="add-customer-description" onClick={(event) => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-brand-nightSurface p-5 shadow-2xl sm:rounded-2xl">
        <header className="mb-5 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-sky/10 text-brand-skyLight"><UserPlus size={19} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="add-customer-title" className="font-semibold text-brand-nightText">Add customer</h2>
            <p id="add-customer-description" className="mt-1 text-xs leading-relaxed text-brand-nightText/45">Create a family profile with a parent contact and at least one child.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-brand-nightText/45 hover:bg-white/5 hover:text-brand-nightText"><X size={17} /></button>
        </header>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium text-brand-nightText/55">Parent or guardian name
            <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-brand-nightSurface2 px-3 text-sm text-brand-nightText outline-none focus:border-brand-sky/60" />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-brand-nightText/55">Phone number
            <input required type="tel" inputMode="tel" maxLength={24} value={phone} onChange={(event) => setPhone(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-brand-nightSurface2 px-3 text-sm text-brand-nightText outline-none focus:border-brand-sky/60" />
          </label>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-brand-nightText/65">Children</p><button type="button" disabled={children.length >= 10} onClick={() => setChildren((rows) => [...rows, { name: "", dateOfBirth: initialDateOfBirth() }])} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-brand-sky/25 px-2.5 text-xs font-semibold text-brand-skyLight disabled:opacity-40"><Plus size={13} /> Add child</button></div>
            {children.map((child, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.8fr)_auto] items-end gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <label className="min-w-0 space-y-1.5 text-[11px] font-medium text-brand-nightText/45">Child {index + 1}
                <input required maxLength={120} value={child.name} onChange={(event) => setChildren((rows) => rows.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} className="min-h-10 w-full rounded-lg border border-white/12 bg-brand-nightSurface2 px-2.5 text-sm text-brand-nightText outline-none focus:border-brand-sky/60" />
              </label>
              <label className="min-w-0 space-y-1.5 text-[11px] font-medium text-brand-nightText/45">Date of birth
                <input required type="date" value={child.dateOfBirth} onChange={(event) => setChildren((rows) => rows.map((row, i) => i === index ? { ...row, dateOfBirth: event.target.value } : row))} className="min-h-10 w-full rounded-lg border border-white/12 bg-brand-nightSurface2 px-2 text-xs text-brand-nightText outline-none focus:border-brand-sky/60" />
              </label>
              {children.length > 1 && <button type="button" onClick={() => setChildren((rows) => rows.filter((_, i) => i !== index))} aria-label={`Remove child ${index + 1}`} className="mb-1 rounded-lg p-2 text-brand-coral hover:bg-brand-coral/10"><X size={15} /></button>}
            </div>)}
          </div>
          {error && <p role="alert" className="rounded-xl border border-brand-coral/25 bg-brand-coral/10 px-3 py-2.5 text-sm text-brand-coral">{error}</p>}
          <div className="grid grid-cols-2 gap-2 pt-1"><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/12 px-4 text-sm font-semibold text-brand-nightText/65">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-brand-sky px-4 text-sm font-semibold text-brand-ink disabled:opacity-50">{busy ? "Adding…" : "Add customer"}</button></div>
        </form>
      </section>
    </div>
  );
}
