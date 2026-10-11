"use client";

import { useState } from "react";
import { ChevronDown, Database, Download, ShieldCheck } from "lucide-react";

const GROUPS = [
  { id: "customers", label: "Customers & children", detail: "Family contact details, child profiles, and saved health information." },
  { id: "memberships", label: "Memberships & special passes", detail: "Plans, current subscriptions, and special-day passes." },
  { id: "checkins", label: "Check-in history", detail: "Play sessions, including check-in and check-out times." },
  { id: "registrations", label: "Registrations & parties", detail: "Membership requests, party packages, and party bookings." },
  { id: "staff", label: "Staff & attendance", detail: "Staff directory, shifts, and punch records." },
  { id: "settings", label: "Settings & notification records", detail: "Venue settings, notification rules and preferences, employee inbox, and delivery history." },
] as const;

type GroupId = (typeof GROUPS)[number]["id"];

export default function AdminDataExport() {
  const [selected, setSelected] = useState<GroupId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async (groups: GroupId[]) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? "The export could not be created.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `qureocity-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The export could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: GroupId) => setSelected((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
  );

  return (
    <details className="group rounded-2xl border border-white/10 bg-brand-nightSurface">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-sky/12 text-brand-skyLight"><Database size={19} /></span>
        <span className="min-w-0 flex-1"><span className="block font-bold text-brand-nightText">Export data &amp; backups</span><span className="mt-0.5 block text-sm text-brand-nightText/45">Choose records or download a complete business-data backup.</span></span>
        <ChevronDown size={18} className="shrink-0 text-brand-nightText/45 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-white/8 p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <label key={group.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.05]">
              <input type="checkbox" checked={selected.includes(group.id)} onChange={() => toggle(group.id)} className="mt-1 h-4 w-4 accent-[#9B72B0]" />
              <span><span className="block text-sm font-semibold text-brand-nightText">{group.label}</span><span className="mt-0.5 block text-xs leading-5 text-brand-nightText/45">{group.detail}</span></span>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" disabled={busy || selected.length === 0} onClick={() => void download(selected)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-sky px-4 text-sm font-bold text-brand-ink transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40">
            <Download size={16} />{busy ? "Preparing export…" : "Export selected data"}
          </button>
          <button type="button" disabled={busy} onClick={() => void download(GROUPS.map((group) => group.id))} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-brand-sky/35 px-4 text-sm font-bold text-brand-skyLight transition-colors hover:bg-brand-sky/10 disabled:cursor-not-allowed disabled:opacity-40">
            <Database size={16} />Download full backup
          </button>
        </div>
        <p className="flex items-start gap-2 text-xs leading-5 text-brand-nightText/45"><ShieldCheck size={15} className="mt-0.5 shrink-0" />The JSON backup contains one array per selected table. Authentication credentials, password hashes, kiosk sessions, push keys/device tokens, and rate-limit data are excluded. Keep downloaded files in a secure location.</p>
        {error && <p role="alert" className="rounded-lg border border-brand-coral/25 bg-brand-coral/10 px-3 py-2 text-sm text-brand-coral">{error}</p>}
      </div>
    </details>
  );
}
