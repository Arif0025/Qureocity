"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Sidebar, { AdminTabId } from "./Sidebar";
import HomeOverview from "./home/HomeOverview";
import StaffRoster from "./staff/StaffRoster";
import QrModeToggle from "./QrModeToggle";
import SubscriptionsManager from "./SubscriptionsManager";
import AdminPasswordCard from "./AdminPasswordCard";
import QuickCheckin from "@/components/employee/QuickCheckin";
import CustomerSearch from "@/components/shared/CustomerSearch";
import { SessionRow } from "./home/KidsCheckedInCard";

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

const CUSTOMER_SUBTABS = [
  { id: "directory", label: "Directory" },
  { id: "subscriptions", label: "Subscriptions" },
] as const;

const STAFF_SUBTABS = [
  { id: "team", label: "Team" },
  { id: "settings", label: "Settings" },
] as const;

function AdminDashboardV2Inner({
  employeeName,
  isAdmin,
  initialSessions,
  staff,
  qrMode,
  onDutyStaff,
  todayCheckinCount,
  avgDurationMins,
  venueCapacity,
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
    auto_punched_out?: boolean;
    employees: { name: string } | null;
  }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const VALID_TABS: AdminTabId[] = [
    "home",
    "customers",
    "staff",
    "clubcheckin",
  ];
  const tabFromUrl = searchParams.get("tab") as AdminTabId | null;
  const [tab, setTabState] = useState<AdminTabId>(
    tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : "home",
  );
  const [customerSubtab, setCustomerSubtab] =
    useState<(typeof CUSTOMER_SUBTABS)[number]["id"]>("directory");
  const [customerSearchQuery, setCustomerSearchQuery] = useState(
    searchParams.get("customer") ?? "",
  );
  const [staffSubtab, setStaffSubtab] =
    useState<(typeof STAFF_SUBTABS)[number]["id"]>("team");
  const [staffFocusEmployeeId, setStaffFocusEmployeeId] = useState<
    string | null
  >(null);

  // Keep the URL in sync so a refresh (or someone bookmarking/sharing a
  // link) lands back on the same section instead of resetting to Home.
  const setTab = (id: AdminTabId) => {
    setTabState(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== tab) {
      setTabState(tabFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/employee/login");
  };

  const openStaffEmployee = (employeeId: string) => {
    setStaffFocusEmployeeId(employeeId);
    setStaffSubtab("team");
    setTab("staff");
  };

  const openCustomerDirectory = (customerKey: string) => {
    setCustomerSubtab("directory");
    setCustomerSearchQuery(customerKey);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "customers");
    params.set("customer", customerKey);
    setTabState("customers");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="dark-ui min-h-screen bg-brand-nightBg md:flex">
      <Sidebar
        active={tab}
        onSelect={setTab}
        employeeName={employeeName}
        onSignOut={handleSignOut}
      />

      <main className="flex-1 min-w-0 px-5 md:px-10 py-6 md:py-10">
        <div className="max-w-6xl mx-auto">
          {tab === "home" && (
            <>
              <h1 className="text-xl font-bold text-brand-nightText mb-6">
                Home
              </h1>
              <HomeOverview
                initialSessions={initialSessions}
                todayCheckinCount={todayCheckinCount}
                venueCapacity={venueCapacity}
                onDutyStaff={onDutyStaff}
                totalStaff={staff.length}
                shifts={shifts}
                attendanceLogs={attendanceLogs}
                dailyCounts={dailyCounts}
                onInspectStaffEmployee={openStaffEmployee}
                onOpenCustomerDirectory={openCustomerDirectory}
              />
            </>
          )}

          {tab === "clubcheckin" && (
            <>
              <h1 className="text-lg font-bold text-brand-nightText mb-1">
                Club check-in
              </h1>
              <p className="text-brand-nightText/50 text-sm mb-6">
                Search a subscribed child by name — no phone number needed.
              </p>
              <QuickCheckin />
            </>
          )}

          {tab === "customers" && (
            <>
              <h1 className="text-lg font-bold text-brand-nightText mb-1">
                Customers
              </h1>
              <p className="text-brand-nightText/50 text-sm mb-5">
                Registered families, their history, and subscriptions.
              </p>
              <div className="flex gap-1 border-b border-white/8 mb-6">
                {CUSTOMER_SUBTABS.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setCustomerSubtab(st.id)}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                      customerSubtab === st.id
                        ? "border-brand-skyLight text-brand-skyLight"
                        : "border-transparent text-brand-nightText/50 hover:text-brand-nightText"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
              {customerSubtab === "directory" && (
                <CustomerSearch
                  isAdmin={true}
                  initialQuery={customerSearchQuery}
                  focusCustomerPhone={customerSearchQuery}
                />
              )}
              {customerSubtab === "subscriptions" && <SubscriptionsManager />}
            </>
          )}

          {tab === "staff" && (
            <>
              <h1 className="text-lg font-bold text-brand-nightText mb-1">
                Staff
              </h1>
              <p className="text-brand-nightText/50 text-sm mb-5">
                {isAdmin
                  ? "Roles, shifts, and attendance for the team."
                  : "Everyone currently on the roster."}
              </p>
              {isAdmin ? (
                <>
                  <div className="flex gap-1 border-b border-white/8 mb-6 overflow-x-auto no-scrollbar">
                    {STAFF_SUBTABS.map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setStaffSubtab(st.id)}
                        className={`shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                          staffSubtab === st.id
                            ? "border-brand-skyLight text-brand-skyLight"
                            : "border-transparent text-brand-nightText/50 hover:text-brand-nightText"
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                  {staffSubtab === "team" && (
                    <StaffRoster
                      staff={staff}
                      initialShifts={shifts}
                      isAdmin={isAdmin}
                      activeEmployeeId={staffFocusEmployeeId}
                    />
                  )}
                  {staffSubtab === "settings" && (
                    <div className="max-w-sm space-y-4">
                      <QrModeToggle initialMode={qrMode} />
                      <AdminPasswordCard />
                    </div>
                  )}
                </>
              ) : (
                <StaffRoster
                  staff={staff}
                  initialShifts={shifts}
                  isAdmin={isAdmin}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AdminDashboardV2(
  props: Parameters<typeof AdminDashboardV2Inner>[0],
) {
  return (
    <Suspense fallback={null}>
      <AdminDashboardV2Inner {...props} />
    </Suspense>
  );
}
