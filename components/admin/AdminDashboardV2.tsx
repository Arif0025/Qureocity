"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home as HomeIcon } from "lucide-react";
import Sidebar, { AdminTabId } from "./Sidebar";
import HomeOverview from "./home/HomeOverview";
import StaffRoster from "./staff/StaffRoster";
import QrModeToggle from "./QrModeToggle";
import SubscriptionsManager from "./SubscriptionsManager";
import AdminPasswordCard from "./AdminPasswordCard";
import QuickCheckin from "@/components/employee/QuickCheckin";
import CustomerSearch from "@/components/shared/CustomerSearch";
import MembershipRegistrations from "./MembershipRegistrations";
import PlansManager from "./PlansManager";
import BroadcastWhatsApp from "./BroadcastWhatsApp";
import { SessionRow } from "./home/KidsCheckedInCard";

function BackToHomeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Back to Home"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-nightText/50 hover:text-brand-skyLight border border-white/10 hover:border-brand-sky/40 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
    >
      <HomeIcon size={13} />
      Home
    </button>
  );
}

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

const MEMBERSHIPS_SUBTABS = [
  { id: "subscribers", label: "Subscribers" },
  { id: "plans", label: "Plans" },
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
    "directory",
    "memberships",
    "staff",
    "clubcheckin",
    "pending",
    "broadcast",
    "settings",
  ];
  const tabFromUrl = searchParams.get("tab") as AdminTabId | null;
  const [tab, setTabState] = useState<AdminTabId>(
    tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : "home",
  );

  const [membershipsSubtab, setMembershipsSubtab] =
    useState<(typeof MEMBERSHIPS_SUBTABS)[number]["id"]>("subscribers");
  const [customerSearchQuery, setCustomerSearchQuery] = useState(
    searchParams.get("customer") ?? "",
  );
  const [directoryNewOnly, setDirectoryNewOnly] = useState(false);
  const [membershipsFilter, setMembershipsFilter] = useState<
    "expiring_soon" | "new_this_month" | undefined
  >(undefined);
  const [plansTypeFilter, setPlansTypeFilter] = useState<
    "recurring" | "special"
  >("recurring");
  const [plansFocusId, setPlansFocusId] = useState<string | null>(null);
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
    setTab("staff");
  };

  const goToPending = () => {
    setTab("pending");
  };

  const goToNewFamilies = () => {
    setDirectoryNewOnly(true);
    setTab("directory");
  };
  const goToNewMemberships = () => {
    setMembershipsFilter("new_this_month");
    setMembershipsSubtab("subscribers");
    setTab("memberships");
  };
  const goToExpiring = () => {
    setMembershipsFilter("expiring_soon");
    setMembershipsSubtab("subscribers");
    setTab("memberships");
  };
  const goToPlan = (
    planId: string | null,
    planType: "recurring" | "special",
  ) => {
    setPlansTypeFilter(planType);
    setPlansFocusId(planId);
    setMembershipsSubtab("plans");
    setTab("memberships");
  };

  const openCustomerDirectory = (customerKey: string) => {
    setCustomerSearchQuery(customerKey);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "directory");
    params.set("customer", customerKey);
    setTabState("directory");
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
                Overview
              </h1>
              <HomeOverview
                initialSessions={initialSessions}
                todayCheckinCount={todayCheckinCount}
                venueCapacity={venueCapacity}
                onDutyStaff={onDutyStaff}
                totalStaff={staff.filter((s) => s.role !== "admin").length}
                shifts={shifts}
                attendanceLogs={attendanceLogs}
                dailyCounts={dailyCounts}
                onInspectStaffEmployee={openStaffEmployee}
                onOpenCustomerDirectory={openCustomerDirectory}
                onPendingClick={goToPending}
                onNewFamiliesClick={goToNewFamilies}
                onNewMembershipsClick={goToNewMemberships}
                onExpiringClick={goToExpiring}
                onOpenPlan={goToPlan}
              />
            </>
          )}

          {tab === "pending" && (
            <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className="text-lg font-bold text-brand-nightText">
                  Pending memberships
                </h1>
                <BackToHomeButton onClick={() => setTab("home")} />
              </div>
              <p className="text-brand-nightText/50 text-sm mb-5">
                Membership sign-ups and renewals awaiting review.
              </p>
              <MembershipRegistrations />
            </>
          )}

          {tab === "broadcast" && (
            <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className="text-lg font-bold text-brand-nightText">
                  WhatsApp broadcast
                </h1>
                <BackToHomeButton onClick={() => setTab("home")} />
              </div>
              <p className="text-brand-nightText/50 text-sm mb-6">
                Filter families and send personalized messages — opens WhatsApp
                with the message ready, you tap send.
              </p>
              <BroadcastWhatsApp />
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

          {tab === "directory" && (
            <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className="text-lg font-bold text-brand-nightText">
                  Directory
                </h1>
                <BackToHomeButton onClick={() => setTab("home")} />
              </div>
              <p className="text-brand-nightText/50 text-sm mb-6">
                Registered families and their children — search by name or
                phone.
              </p>
              <CustomerSearch
                isAdmin={true}
                initialQuery={customerSearchQuery}
                focusCustomerPhone={customerSearchQuery}
                filterNewThisMonth={directoryNewOnly}
              />
            </>
          )}

          {tab === "memberships" && (
            <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className="text-lg font-bold text-brand-nightText">
                  Memberships
                </h1>
                <BackToHomeButton onClick={() => setTab("home")} />
              </div>
              <p className="text-brand-nightText/50 text-sm mb-5">
                Subscriber status, monthly plans, and special days.
              </p>
              <div className="flex gap-1 border-b border-white/8 mb-6">
                {MEMBERSHIPS_SUBTABS.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setMembershipsSubtab(st.id)}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                      membershipsSubtab === st.id
                        ? "border-brand-skyLight text-brand-skyLight"
                        : "border-transparent text-brand-nightText/50 hover:text-brand-nightText"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
              {membershipsSubtab === "subscribers" && (
                <SubscriptionsManager initialFilter={membershipsFilter} />
              )}
              {membershipsSubtab === "plans" && (
                <PlansManager
                  key={`${plansTypeFilter}:${plansFocusId ?? "none"}`}
                  initialTypeFilter={plansTypeFilter}
                  initialExpandedPlanId={plansFocusId}
                />
              )}
            </>
          )}

          {tab === "staff" && (
            <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className="text-lg font-bold text-brand-nightText">
                  Staff
                </h1>
                <BackToHomeButton onClick={() => setTab("home")} />
              </div>
              <p className="text-brand-nightText/50 text-sm mb-5">
                {isAdmin
                  ? "Roles, shifts, and attendance for the team."
                  : "Everyone currently on the roster."}
              </p>
              <StaffRoster
                staff={staff}
                initialShifts={shifts}
                isAdmin={isAdmin}
                activeEmployeeId={staffFocusEmployeeId}
              />
            </>
          )}

          {tab === "settings" && (
            <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className="text-lg font-bold text-brand-nightText">
                  Settings
                </h1>
                <BackToHomeButton onClick={() => setTab("home")} />
              </div>
              <p className="text-brand-nightText/50 text-sm mb-6">
                Configure administrative and check-in options.
              </p>
              <div className="max-w-sm space-y-4">
                <QrModeToggle initialMode={qrMode} />
                <AdminPasswordCard />
              </div>
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
