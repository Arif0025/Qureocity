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
import PendingConfirmations from "@/components/shared/PendingConfirmations";
import MembershipRegistrations from "./MembershipRegistrations";
import PlansManager from "./PlansManager";
import BroadcastWhatsApp from "./BroadcastWhatsApp";
import { usePendingCount } from "@/lib/hooks/usePendingCount";
import { usePendingRegistrationsCount } from "@/lib/hooks/usePendingRegistrationsCount";
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

const CUSTOMER_SUBTABS = [
  { id: "directory", label: "Directory" },
  { id: "subscriptions", label: "Memberships" },
  { id: "plans", label: "Plans" },
] as const;

const PENDING_SUBTABS = [
  { id: "payments", label: "Payments" },
  { id: "memberships", label: "Memberships" },
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
    "pending",
    "broadcast",
  ];
  const tabFromUrl = searchParams.get("tab") as AdminTabId | null;
  const [tab, setTabState] = useState<AdminTabId>(
    tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : "home",
  );
  const [focusPendingId, setFocusPendingId] = useState<string | null>(null);
  const [pendingSubtab, setPendingSubtab] =
    useState<(typeof PENDING_SUBTABS)[number]["id"]>("payments");
  const [pendingSubtabTouched, setPendingSubtabTouched] = useState(false);
  const paymentsPendingCount = usePendingCount();
  const membershipsPendingCount = usePendingRegistrationsCount();

  // Land on whichever queue actually has something in it — badge said
  // "1" but the tab defaulted to Payments regardless of where that 1
  // actually was, which read as "the tab is broken." Only auto-picks
  // once (pendingSubtabTouched), so it doesn't yank the admin back to
  // Payments mid-review just because a membership got confirmed elsewhere.
  useEffect(() => {
    if (pendingSubtabTouched) return;
    if (paymentsPendingCount === 0 && membershipsPendingCount > 0) {
      setPendingSubtab("memberships");
    }
  }, [paymentsPendingCount, membershipsPendingCount, pendingSubtabTouched]);

  const [customerSubtab, setCustomerSubtab] =
    useState<(typeof CUSTOMER_SUBTABS)[number]["id"]>("directory");
  const [customerSearchQuery, setCustomerSearchQuery] = useState(
    searchParams.get("customer") ?? "",
  );
  const [directoryNewOnly, setDirectoryNewOnly] = useState(false);
  const [membershipsFilter, setMembershipsFilter] = useState<
    "expiring_soon" | "new_this_month" | undefined
  >(undefined);
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

  const goToPending = (sessionId: string) => {
    setFocusPendingId(sessionId);
    setTab("pending");
  };

  const goToNewFamilies = () => {
    setDirectoryNewOnly(true);
    setCustomerSubtab("directory");
    setTab("customers");
  };
  const goToNewMemberships = () => {
    setMembershipsFilter("new_this_month");
    setCustomerSubtab("subscriptions");
    setTab("customers");
  };
  const goToExpiring = () => {
    setMembershipsFilter("expiring_soon");
    setCustomerSubtab("subscriptions");
    setTab("customers");
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
              />
            </>
          )}

          {tab === "pending" && (
            <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className="text-lg font-bold text-brand-nightText">
                  Pending confirmations
                </h1>
                <BackToHomeButton onClick={() => setTab("home")} />
              </div>
              <p className="text-brand-nightText/50 text-sm mb-5">
                {pendingSubtab === "payments"
                  ? "Kids checked in from the kiosk, awaiting payment confirmation."
                  : "Membership sign-ups from the kiosk, awaiting review."}
              </p>
              <div className="flex gap-1 border-b border-white/8 mb-6">
                {PENDING_SUBTABS.map((st) => {
                  const count =
                    st.id === "payments"
                      ? paymentsPendingCount
                      : membershipsPendingCount;
                  return (
                    <button
                      key={st.id}
                      onClick={() => {
                        setPendingSubtab(st.id);
                        setPendingSubtabTouched(true);
                      }}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        pendingSubtab === st.id
                          ? "border-brand-skyLight text-brand-skyLight"
                          : "border-transparent text-brand-nightText/50 hover:text-brand-nightText"
                      }`}
                    >
                      {st.label}
                      {count > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-coral text-white text-[10px] font-bold flex items-center justify-center">
                          {count > 9 ? "9+" : count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {pendingSubtab === "payments" && (
                <PendingConfirmations focusSessionId={focusPendingId} />
              )}
              {pendingSubtab === "memberships" && <MembershipRegistrations />}
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

          {tab === "customers" && (
            <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className="text-lg font-bold text-brand-nightText">
                  Customers
                </h1>
                <BackToHomeButton onClick={() => setTab("home")} />
              </div>
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
                  filterNewThisMonth={directoryNewOnly}
                />
              )}
              {customerSubtab === "subscriptions" && (
                <SubscriptionsManager initialFilter={membershipsFilter} />
              )}
              {customerSubtab === "plans" && <PlansManager />}
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
