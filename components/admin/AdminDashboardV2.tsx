"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, Home as HomeIcon, LogOut, UserPlus } from "lucide-react";
import Sidebar, { AdminTabId } from "./Sidebar";
import HomeOverview from "./home/HomeOverview";
import StaffRoster from "./staff/StaffRoster";
import QrModeToggle from "./QrModeToggle";
import NotificationRulesManager from "./NotificationRulesManager";
import MessageTemplatesManager from "./MessageTemplatesManager";
import NotificationsCard from "@/components/shared/NotificationsCard";
import PushToast from "@/components/shared/PushToast";
import GlobalSearch, { SearchNavItem } from "@/components/shared/GlobalSearch";
import HelpTab from "@/components/shared/HelpTab";
import PageTransition from "@/components/ui/PageTransition";
import AdminPasswordCard from "./AdminPasswordCard";
import KioskAccessCard from "./KioskAccessCard";
import Directory from "./Directory";
import PlansManager from "./PlansManager";
import AdminNotifications from "./AdminNotifications";
import PartyBookingSettingsCard from "./PartyBookingSettingsCard";
import AdminDataExport from "./AdminDataExport";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { useInAppBackStack } from "@/lib/hooks/useInAppBackStack";
import { expandCollapse } from "@/lib/motion";
import ContactMessageSheet from "@/components/shared/ContactMessageSheet";
import PushOvertimeNotifySheet from "./PushOvertimeNotifySheet";
import { formatTimeIST } from "@/lib/formatTime";

function SettingsDisclosure({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <section className="group overflow-hidden rounded-2xl border border-white/10 bg-brand-nightSurface">
      <button type="button" aria-expanded={opened} onClick={() => {
        setOpened((value) => !value);
        setLoaded(true);
      }} className="flex w-full cursor-pointer items-center gap-3 p-4 text-left sm:p-5">
        <span className="min-w-0 flex-1"><span className="block font-bold text-brand-nightText">{title}</span><span className="mt-0.5 block text-sm text-brand-nightText/45">{description}</span></span>
        <ChevronDown size={18} className={`shrink-0 text-brand-nightText/45 transition-transform ${opened ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {loaded && opened && <motion.div {...expandCollapse} className="overflow-hidden">
          <div className="space-y-3 border-t border-white/8 p-4 sm:p-5">{children}</div>
        </motion.div>}
      </AnimatePresence>
    </section>
  );
}

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
type Shift = {
  id: string;
  employee_id: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  employees: { name: string } | null;
};

function AdminDashboardV2Inner({
  employeeName,
  isAdmin,
  staff,
  qrMode,
  venueCapacity,
  shifts,
  shiftsLoaded,
}: {
  employeeName: string;
  isAdmin: boolean;
  staff: Staff[];
  qrMode: "static" | "dynamic";
  venueCapacity: number;
  shifts: Shift[];
  shiftsLoaded: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const replaceInAppView = useCallback(
    (href: string) => router.replace(href, { scroll: false }),
    [router],
  );
  const rememberInAppView = useInAppBackStack(pathname, replaceInAppView);

  const VALID_TABS: AdminTabId[] = [
    "home",
    "directory",
    "notifications",
    "memberships",
    "staff",
    "settings",
    "help",
  ];

  // The URL is the single source of truth for which view is showing, so
  // the browser / phone Back button walks back through the views the
  // user actually visited instead of jumping out of the app. Every
  // piece of view state that a link like "Expiring soon" or "Open plan"
  // sets lives in a search param:
  //   tab      section (home, directory, memberships, ...)
  //   sub      memberships sub-tab (subscribers | plans)
  //   mf       memberships filter (expiring_soon | new_this_month)
  //   pt/plan  plans type filter / plan to expand
  //   staff    staff member to expand
  //   new      directory "new this month" filter (1)
  //   customer directory search / focus key
  //   article  help article slug (tab=help)
  const rawTab = searchParams.get("tab");
  const rawMode = searchParams.get("mode");
  const resolvedTab = rawTab === "directory" && rawMode === "pending" ? "notifications" : rawTab;
  const tab: AdminTabId = VALID_TABS.includes(resolvedTab as AdminTabId)
    ? (resolvedTab as AdminTabId)
    : "home";

  const plansTypeFilter: "recurring" | "special" =
    searchParams.get("pt") === "special" ? "special" : "recurring";
  const plansFocusId = searchParams.get("plan");
  const staffFocusEmployeeId = searchParams.get("staff");
  const staffNotifyEmployeeId = searchParams.get("notify") === "1" ? staffFocusEmployeeId : null;
  const directoryNewOnly = searchParams.get("new") === "1";
  const directoryExpiringOnly = searchParams.get("expiring") === "1";
  const directoryPlanId = searchParams.get("filterplan") ?? undefined;
  const directoryBrowseAll = searchParams.get("browse") === "all";
  const directoryMode = rawMode === "members" ? "members" : "all";
  const customerSearchQuery = searchParams.get("customer") ?? "";
  const customerChildId = searchParams.get("child") ?? undefined;
  const helpArticleSlug = searchParams.get("article");

  // Moving to a view pushes a new history entry (not replace). Params
  // from the previous view are dropped so stale filters can't leak in.
  const navigate = (
    nextTab: AdminTabId,
    extra: Record<string, string | undefined> = {},
  ) => {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
    const next = `${pathname}?${params.toString()}`;
    // Re-selecting the view you're already on shouldn't stack a
    // duplicate entry that makes Back appear to do nothing.
    if (next === `${pathname}?${searchParams.toString()}`) return;
    // Keep tab changes client-side. router.push() requests a fresh RSC
    // render of app/admin/page, repeating auth and employee queries on
    // every switch. Next integrates native history updates with
    // useSearchParams/usePathname, while preserving Back/Forward history.
    rememberInAppView(next);
    window.history.pushState(null, "", next);
  };
  const setTab = (id: AdminTabId) => navigate(id);

  const [supabase] = useState(() => createClient());
  const messageSessionId = searchParams.get("message_session");
  const messageEvent = searchParams.get("message_event");
  const messageTemplateKey = messageEvent === "child_checkout_push" ? "child_checkout_push" : "customer_contact";
  const messageContextKey = messageSessionId ? `${messageSessionId}:${messageTemplateKey}` : null;
  const overtimeNotifySessionId = searchParams.get("notify_session");
  const processedMessageSession = useRef<string | null>(null);
  const [pushMessageCustomer, setPushMessageCustomer] = useState<{
    phone: string; parent_name: string; child_name: string; date_of_birth: string; checkout_time: string;
  } | null>(null);
  const [pushMessageError, setPushMessageError] = useState<string | null>(null);
  useEffect(() => {
    if (!isAdmin || !messageSessionId || !messageContextKey || processedMessageSession.current === messageContextKey) return;
    processedMessageSession.current = messageContextKey;
    let active = true;
    void supabase.rpc("admin_session_message_context", { p_session_id: messageSessionId }).then(({ data, error }) => {
      if (!active) return;
      const row = data as { phone?: string; parent_name?: string; child_name?: string; date_of_birth?: string; ended_at?: string | null; end_time?: string | null } | null;
      if (error || !row?.phone) {
        setPushMessageError(error?.message ?? "Customer contact details are unavailable.");
        return;
      }
      setPushMessageCustomer({
        phone: row.phone,
        parent_name: row.parent_name ?? "there",
        child_name: row.child_name ?? "your child",
        date_of_birth: row.date_of_birth ?? "",
        checkout_time: row.ended_at || row.end_time ? formatTimeIST(row.ended_at || row.end_time!) : "",
      });
    });
    return () => { active = false; };
  }, [isAdmin, messageContextKey, messageSessionId, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/employee/login");
  };

  const openStaffEmployee = (employeeId: string) =>
    navigate("staff", { staff: employeeId });

  const goToNotifications = () => navigate("notifications");

  const goToNewFamilies = () => navigate("directory", { new: "1" });
  const goToNewMemberships = () =>
    navigate("directory", { mode: "members", new: "1" });
  const goToExpiring = () =>
    navigate("directory", { mode: "members", expiring: "1" });
  const goToPlan = (planId: string | null, planType: "recurring" | "special") =>
    navigate("memberships", {
      sub: "plans",
      pt: planType,
      plan: planId ?? undefined,
    });

  const openCustomerDirectory = (customerKey: string, childId?: string) =>
    navigate("directory", { customer: customerKey, child: childId });

  const openHelpArticle = (slug: string | null) =>
    navigate("help", { article: slug ?? undefined });

  const [searchOpen, setSearchOpen] = useState(false);
  const [newRegistrationAlert, setNewRegistrationAlert] = useState(false);
  useEffect(() => {
    const channel = supabase
      .channel(`admin_registration_alert_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "membership_registrations" }, () => {
        setNewRegistrationAlert(true);
        window.setTimeout(() => setNewRegistrationAlert(false), 6500);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase]);
  const ADMIN_SEARCH_NAV: SearchNavItem[] = [
    { id: "home", label: "Overview", keywords: ["dashboard", "today"] },
    {
      id: "directory",
      label: "Customers",
      keywords: [
        "customers",
        "families",
        "members",
        "subscribers",
        "message",
        "whatsapp",
      ],
    },
    { id: "notifications", label: "Notifications", keywords: ["new registration", "pending", "pending registration", "special day"] },
    {
      id: "memberships",
      label: "Plans",
      keywords: ["memberships", "subscriptions", "special days"],
    },
    { id: "staff", label: "Staff", keywords: ["team", "roster", "shifts"] },
    {
      id: "settings",
      label: "Settings",
    keywords: ["notifications", "qr", "password", "export", "backup", "theme", "dark mode", "sign out"],
    },
    { id: "help", label: "Help", keywords: ["faq", "how to"] },
  ];

  return (
    <div className="dark-ui min-h-screen bg-brand-nightBg md:flex">
      <PushToast />
      <Sidebar
        active={tab}
        onSelect={setTab}
        onNotificationsClick={goToNotifications}
        employeeName={employeeName}
        onSearchClick={() => setSearchOpen(true)}
      />
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        isAdmin={true}
        staff={staff}
        navItems={ADMIN_SEARCH_NAV}
        onNavigate={(id) => navigate(id as AdminTabId)}
        onOpenCustomer={openCustomerDirectory}
        onOpenStaffEmployee={openStaffEmployee}
        onOpenHelp={openHelpArticle}
      />

      {newRegistrationAlert && (
        <button type="button" onClick={goToNotifications} className="fixed right-4 top-16 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-brand-sky/30 bg-brand-nightSurface px-4 py-3 text-left shadow-xl shadow-black/20 animate-in slide-in-from-top-2 fade-in duration-200">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-sky/15 text-brand-skyLight"><UserPlus size={17} /></span>
          <span><span className="block text-sm font-semibold text-brand-nightText">New registration received</span><span className="block text-xs text-brand-nightText/45">Tap to review it now</span></span>
        </button>
      )}

      <main className="flex-1 min-w-0 px-5 md:px-10 py-6 md:py-10 pb-24 md:pb-10">
        {isAdmin && overtimeNotifySessionId && <PushOvertimeNotifySheet
          sessionId={overtimeNotifySessionId}
          staff={staff.map(({ id, name }) => ({ id, name }))}
          onClose={() => {
            const params = new URLSearchParams(window.location.search);
            params.delete("notify_session");
            window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
          }}
        />}
        {pushMessageCustomer && <ContactMessageSheet
          open
          onClose={() => {
            setPushMessageCustomer(null);
            processedMessageSession.current = null;
            const params = new URLSearchParams(window.location.search);
            params.delete("message_session");
            params.delete("message_event");
            const query = params.toString();
            window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}`);
          }}
          title={`Message ${pushMessageCustomer.parent_name}`}
          phone={pushMessageCustomer.phone}
          templateValues={{ ...pushMessageCustomer, business_name: "QureoCity" }}
          templateKey={messageTemplateKey}
          initialMessage={messageTemplateKey === "child_checkout_push"
            ? "Hi {{parent_name}}! This is {{business_name}} — {{child_name}} has finished today's visit. Let us know if you need anything."
            : "Hi {{parent_name}}! This is {{business_name}}. I’m reaching out about {{child_name}}’s visit. How can we help?"}
          canManageTemplates
        />}
        {pushMessageError && <div role="alert" className="fixed inset-x-4 top-4 z-[80] mx-auto max-w-lg rounded-xl border border-brand-coral/30 bg-brand-nightSurface p-4 text-sm text-brand-coral shadow-xl">{pushMessageError}<button type="button" className="ml-3 underline" onClick={() => {
          setPushMessageError(null);
          processedMessageSession.current = null;
          const params = new URLSearchParams(window.location.search);
          params.delete("message_session");
          params.delete("message_event");
          const query = params.toString();
          window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}`);
        }}>Dismiss</button></div>}
        <div className="max-w-6xl mx-auto">
          <PageTransition pageKey={tab}>
            {tab === "home" && (
              <>
                <h1 className="text-xl font-bold text-brand-nightText mb-6">
                  Overview
                </h1>
                <HomeOverview
                  venueCapacity={venueCapacity}
                  onOpenCustomerDirectory={openCustomerDirectory}
                  onNewFamiliesClick={goToNewFamilies}
                  onNewMembershipsClick={goToNewMemberships}
                  onExpiringClick={goToExpiring}
                  onOpenPlan={goToPlan}
                />
              </>
            )}

            {tab === "directory" && (
              <>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h1 className="text-lg font-bold text-brand-nightText">
                    Customers
                  </h1>
                  <BackToHomeButton onClick={() => setTab("home")} />
                </div>
                <Directory
                  isAdmin
                  initialMode={directoryMode}
                  initialQuery={customerSearchQuery}
                  initialChildId={customerChildId}
                  initialPlanId={directoryPlanId}
                  initialBrowseAll={directoryBrowseAll}
                  initialNewOnly={directoryNewOnly}
                  initialExpiringOnly={directoryExpiringOnly}
                  onOpenMembers={() => navigate("directory", { mode: "members" })}
                  onOpenPlan={(planId) => navigate("directory", { filterplan: planId })}
                  onOpenSearch={(query) => navigate("directory", { customer: query })}
                  onOpenAll={() => navigate("directory", { browse: "all" })}
                  onBack={() => navigate("directory")}
                />
              </>
            )}

            {tab === "notifications" && (
              <>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h1 className="text-lg font-bold text-brand-nightText">Notifications</h1>
                  <BackToHomeButton onClick={() => setTab("home")} />
                </div>
                <p className="text-brand-nightText/50 text-sm mb-6">Review new registrations and keep important requests visible.</p>
                <AdminNotifications onOpenSettings={() => setTab("settings")} />
              </>
            )}

            {tab === "memberships" && (
              <>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h1 className="text-lg font-bold text-brand-nightText">
                    Plans
                  </h1>
                  <BackToHomeButton onClick={() => setTab("home")} />
                </div>
                <p className="text-brand-nightText/50 text-sm mb-6">
                  Design, edit, and manage monthly memberships and special days.
                  Looking for a member? That&apos;s in Customers now.
                </p>
                <PlansManager
                  key={`${plansTypeFilter}:${plansFocusId ?? "none"}`}
                  initialTypeFilter={plansTypeFilter}
                  initialExpandedPlanId={plansFocusId}
                />
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
                  initialShiftsLoaded={shiftsLoaded}
                  isAdmin={isAdmin}
                  activeEmployeeId={staffFocusEmployeeId}
                  notifyEmployeeId={staffNotifyEmployeeId}
                />
              </>
            )}

            {tab === "help" && (
              <HelpTab
                isAdmin={true}
                initialSlug={helpArticleSlug}
                onOpenArticle={openHelpArticle}
              />
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
                <div className="max-w-2xl space-y-3">
                  {isAdmin && (
                    <SettingsDisclosure title="Front desk & kiosk" description="QR display, kiosk access, and registered desk devices.">
                      <QrModeToggle initialMode={qrMode} />
                      <KioskAccessCard />
                    </SettingsDisclosure>
                  )}

                  <SettingsDisclosure title="Notifications" description="Device setup and the venue’s notification rules.">
                    <NotificationsCard />
                    <NotificationRulesManager />
                    <MessageTemplatesManager />
                  </SettingsDisclosure>

                  <AdminDataExport />

                  <SettingsDisclosure title="Password & account" description="Change your password, appearance, or sign out.">
                    <AdminPasswordCard actions={<>
                      <ThemeToggle className="min-h-10 border border-white/10" />
                      <button type="button" onClick={() => void handleSignOut()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-brand-coral/30 px-4 text-sm font-semibold text-brand-coral transition-colors hover:bg-brand-coral/10"><LogOut size={16} />Sign out</button>
                    </>} />
                  </SettingsDisclosure>
                </div>
              </>
            )}
          </PageTransition>
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
