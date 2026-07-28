"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LiveFloorView from "./LiveFloorView";
import StaffTable from "./StaffTable";
import QrModeToggle from "./QrModeToggle";
import AnalyticsOverview from "./AnalyticsOverview";
import ShiftsManager from "./ShiftsManager";
import AttendanceHistory from "./AttendanceHistory";
import SubscriptionsManager from "./SubscriptionsManager";
import AdminPasswordCard from "./AdminPasswordCard";
import ShiftStatusSummary from "@/components/admin/ShiftStatusSummary";
import QuickCheckin from "@/components/employee/QuickCheckin";
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
  start_time: string;
  end_time: string;
  notes: string | null;
  employees: { name: string } | null;
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "floor", label: "Kids Checked In" },
  { id: "quickcheckin", label: "Quick Check-In" },
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
  attendanceLogs,
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
  attendanceLogs: {
    id: string;
    employee_id: string;
    punch_in: string;
    punch_out: string | null;
    employees: { name: string } | null;
  }[];
}) {
  const tabs = isAdmin
    ? [
        ...TABS,
        { id: "subscriptions" as const, label: "Subscriptions" },
        { id: "shifts" as const, label: "Shifts" },
        { id: "attendance" as const, label: "Attendance" },
        { id: "settings" as const, label: "Settings" },
      ]
    : TABS;
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("overview");
  const supabase = createClient();
  const router = useRouter();
  const goToKidsCheckedIn = () => setTab("floor");
  const goToAttendance = () => setTab("attendance");

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

        <nav className="max-w-6xl mx-auto px-6 md:px-8 flex gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
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
            onKidsCheckedIn={goToKidsCheckedIn}
            onAttendance={goToAttendance}
          />
        )}

        {tab === "floor" && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">
              Kids checked in
            </h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              Updates automatically — no refresh needed
            </p>
            <LiveFloorView initialSessions={initialSessions} />
          </>
        )}

        {tab === "quickcheckin" && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">
              Quick Check-In
            </h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              Search a subscribed child by name — no phone number needed.
            </p>
            <QuickCheckin />
          </>
        )}

        {tab === "search" && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">Search</h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              Look up a family by parent name, child's name, or phone number.
            </p>
            <CustomerSearch isAdmin={true} />
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

        {tab === "subscriptions" && isAdmin && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">
              Subscriptions
            </h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              Activate or renew a monthly subscription for a registered family.
            </p>
            <SubscriptionsManager />
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

        {tab === "attendance" && isAdmin && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">
              Attendance
            </h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              Today’s scheduled duty status and recent punch in/out history.
            </p>
            <div className="mb-4">
              <ShiftStatusSummary
                shifts={shifts}
                attendanceLogs={attendanceLogs}
              />
            </div>
            <AttendanceHistory logs={attendanceLogs} />
          </>
        )}

        {tab === "settings" && isAdmin && (
          <>
            <h1 className="text-lg font-bold text-brand-ink mb-1">Settings</h1>
            <p className="text-brand-ink/50 text-sm mb-6">
              Front-desk configuration and your admin account.
            </p>
            <div className="max-w-sm space-y-4">
              <QrModeToggle initialMode={qrMode} />
              <AdminPasswordCard />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
