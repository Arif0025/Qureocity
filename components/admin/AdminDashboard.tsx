"use client";

import { useState } from "react";
import LiveFloorView from "./LiveFloorView";
import StaffTable from "./StaffTable";
import QrModeToggle from "./QrModeToggle";
import AnalyticsOverview from "./AnalyticsOverview";

type SessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  children: { name: string; customers: { name: string } | null } | null;
};
type Staff = { id: string; name: string; role: string };
type OnDutyLog = { employee_id: string; punch_in: string; employees: { name: string } | null };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "floor", label: "Floor View" },
  { id: "staff", label: "Staff" },
] as const;

export default function AdminDashboard({
  employeeName,
  isAdmin,
  initialSessions,
  staff,
  qrMode,
  onDutyStaff,
  todayCheckinCount,
  avgDurationMins,
  venueCapacity,
}: {
  employeeName: string;
  isAdmin: boolean;
  initialSessions: SessionRow[];
  staff: Staff[];
  qrMode: "static" | "dynamic";
  onDutyStaff: OnDutyLog[];
  todayCheckinCount: number;
  avgDurationMins: number | null;
  venueCapacity: number;
}) {
  const tabs = isAdmin ? [...TABS, { id: "settings" as const, label: "Settings" }] : TABS;
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("overview");

  return (
    <div className="min-h-screen bg-[#FAFAFC]">
      <header className="border-b border-black/5 bg-white">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-mark.png" alt="" className="h-8 w-8" />
            <span className="font-bold text-brand-purpleDeep">QureoCity Admin</span>
          </div>
          <span className="text-sm text-brand-ink/50">{employeeName}</span>
        </div>

        <nav className="max-w-6xl mx-auto px-6 md:px-8 flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? "border-brand-sky text-brand-sky"
                  : "border-transparent text-brand-ink/50 hover:text-brand-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 md:px-8 py-8">
        {tab === "overview" && (
          <AnalyticsOverview
            activeCount={initialSessions.length}
            venueCapacity={venueCapacity}
            todayCheckinCount={todayCheckinCount}
            avgDurationMins={avgDurationMins}
            onDutyStaff={onDutyStaff}
          />
        )}

        {tab === "floor" && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">Floor view</h1>
            <p className="text-brand-ink/50 text-sm mb-6">Updates automatically — no refresh needed</p>
            <LiveFloorView initialSessions={initialSessions} />
          </>
        )}

        {tab === "staff" && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">Staff</h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              {isAdmin ? "Add employees and reset passwords here." : "Everyone currently on the roster."}
            </p>
            <StaffTable staff={staff} isAdmin={isAdmin} />
          </>
        )}

        {tab === "settings" && isAdmin && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">Settings</h1>
            <p className="text-brand-ink/50 text-sm mb-6">Front-desk configuration.</p>
            <div className="max-w-sm">
              <QrModeToggle initialMode={qrMode} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
