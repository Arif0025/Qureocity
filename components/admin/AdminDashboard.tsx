"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LiveFloorView from "./LiveFloorView";
import StaffTable from "./StaffTable";
import QrModeToggle from "./QrModeToggle";
import AnalyticsOverview from "./AnalyticsOverview";
import ShiftsManager from "./ShiftsManager";
import CustomerSearch from "@/components/shared/CustomerSearch";

type SessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  children: { name: string; customers: { name: string } | null } | null;
};
type Staff = { id: string; name: string; role: string };
type OnDutyLog = {
  employee_id: string;
  punch_in: string;
  employees: { name: string } | null;
};
type Shift = {
  id: string;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  employees: { name: string } | null;
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "floor", label: "Floor View" },
  { id: "search", label: "Search" },
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
  ageBuckets,
  dailyCounts,
  shifts,
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
  ageBuckets: { bucket: string; cnt: number }[];
  dailyCounts: { day: string; cnt: number }[];
  shifts: Shift[];
}) {
  const tabs = isAdmin
    ? [
        ...TABS,
        { id: "shifts" as const, label: "Shifts" },
        { id: "settings" as const, label: "Settings" },
      ]
    : TABS;
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("overview");
  const supabase = createClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/employee/login");
  };

  return (
    <div className="min-h-screen bg-[#FAFAFC]">
      <header className="border-b border-black/5 bg-white">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-full.png" alt="QureoCity" className="h-8" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-brand-ink/50">{employeeName}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-brand-ink/40 hover:text-brand-coral font-medium"
            >
              Sign out
            </button>
          </div>
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
            ageBuckets={ageBuckets}
            dailyCounts={dailyCounts}
          />
        )}

        {tab === "floor" && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">
              Floor view
            </h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              Updates automatically — no refresh needed
            </p>
            <LiveFloorView initialSessions={initialSessions} />
          </>
        )}

        {tab === "search" && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">Search</h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              Look up a family by parent name, child's name, or phone number.
            </p>
            <CustomerSearch />
          </>
        )}

        {tab === "staff" && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">Staff</h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              {isAdmin
                ? "Add employees and reset passwords here."
                : "Everyone currently on the roster."}
            </p>
            <StaffTable staff={staff} isAdmin={isAdmin} />
          </>
        )}

        {tab === "shifts" && isAdmin && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">Shifts</h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              Assign upcoming shifts — visible to each employee in their own
              panel.
            </p>
            <ShiftsManager staff={staff} initialShifts={shifts} />
          </>
        )}

        {tab === "settings" && isAdmin && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">Settings</h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              Front-desk configuration.
            </p>
            <div className="max-w-sm">
              <QrModeToggle initialMode={qrMode} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
