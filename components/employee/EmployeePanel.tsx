"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { motion } from "framer-motion";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Home as HomeIcon,
  Users,
  CalendarClock,
  LogOut,
  Settings as SettingsIcon,
  Search,
  ScanLine,
} from "lucide-react";
import PunchInFlow from "./PunchInFlow";
import LiveFloorView from "@/components/admin/LiveFloorView";
import KidsCheckedInCard, {
  SessionRow,
} from "@/components/admin/home/KidsCheckedInCard";
import Directory from "@/components/admin/Directory";
import AttendanceCalendarTab from "./AttendanceCalendarTab";
import ShiftDetailsCard from "./ShiftDetailsCard";
import { useTheme } from "@/lib/hooks/useTheme";
import ThemeToggle from "@/components/shared/ThemeToggle";
import NotificationsCard from "@/components/shared/NotificationsCard";
import PushToast from "@/components/shared/PushToast";
import GlobalSearch, { SearchNavItem } from "@/components/shared/GlobalSearch";
import HelpTab from "@/components/shared/HelpTab";
import PageTransition from "@/components/ui/PageTransition";
import BottomSheet from "@/components/ui/BottomSheet";
import EmployeeNotificationBell from "./EmployeeNotificationBell";
import { useInAppBackStack } from "@/lib/hooks/useInAppBackStack";

function ChangePasswordCard() {
  const supabase = useMemo(() => createClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Your password was updated successfully.");
    setNewPassword("");
    setConfirmPassword("");
    setIsOpen(false);
  };

  return (
    <div className="bg-brand-nightSurface rounded-xl2 border border-white/10 p-4">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="text-sm font-semibold text-brand-nightText/70 hover:text-brand-sky transition-colors"
        >
          Change password
        </button>
      ) : (
        <div className="text-sm text-left">
          <p className="font-semibold text-brand-nightText mb-1">
            Change password
          </p>
          <p className="text-brand-nightText/50 mb-3">
            Update the password for your own account only.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full min-h-[44px] rounded-xl2 border-2 border-white/15 bg-brand-nightSurface2 text-brand-nightText px-4 text-base"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full min-h-[44px] rounded-xl2 border-2 border-white/15 bg-brand-nightSurface2 text-brand-nightText px-4 text-base"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="min-h-[36px] rounded-xl2 bg-brand-sky px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setError(null);
                  setMessage(null);
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                className="min-h-[36px] rounded-xl2 bg-white/8 px-3 py-2 text-sm font-semibold text-brand-nightText"
              >
                Cancel
              </button>
            </div>
          </form>
          {error && <p className="text-brand-coral text-sm mt-3">{error}</p>}
          {message && <p className="text-brand-leaf text-sm mt-3">{message}</p>}
        </div>
      )}
    </div>
  );
}

// Shown in the bottom tab bar. "floor" (the full On Site list) is reached
// via the Kids-on-site card's "View all" / pending drilldown rather than
// its own bar button, so Home can show just that card as requested.
const TAB_META = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "search", label: "Customers", icon: Users },
  { id: "activity", label: "Attendance", icon: CalendarClock },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type Tab = (typeof TAB_META)[number]["id"] | "floor" | "help";

function EmployeePanelInner({
  employeeId,
  employeeName,
  initialSessions,
  todayCheckinCount,
  venueCapacity,
}: {
  employeeId: string;
  employeeName: string;
  initialSessions: SessionRow[];
  todayCheckinCount: number;
  venueCapacity: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const replaceInAppView = useCallback(
    (href: string) => router.replace(href, { scroll: false }),
    [router],
  );
  const rememberInAppView = useInAppBackStack(pathname, replaceInAppView);

  const VALID_TABS = [...TAB_META.map((t) => t.id), "floor", "help"] as Tab[];
  // URL is the source of truth for the current view, so Back steps
  // through the views visited instead of leaving the panel.
  const rawTab = searchParams.get("tab");
  const tab: Tab = VALID_TABS.includes(rawTab as Tab)
    ? (rawTab as Tab)
    : "home";
  const customerSearchQuery = searchParams.get("customer") ?? "";
  const customerChildId = searchParams.get("child") ?? undefined;
  const directoryMode = searchParams.get("mode") === "members" ? "members" : "all";
  const directoryPlanId = searchParams.get("filterplan") ?? undefined;
  const directoryBrowseAll = searchParams.get("browse") === "all";
  const helpArticleSlug = searchParams.get("article");
  const { theme } = useTheme();
  const [employeeShift, setEmployeeShift] = useState<{ start_time: string; end_time: string; notes: string | null } | null | undefined>(undefined);
  const logoClass = "opacity-90 transition-opacity hover:opacity-100";
  const logoStyle = theme === "dark"
    ? { filter: "brightness(0) saturate(100%) invert(97%) sepia(18%) saturate(390%) hue-rotate(350deg) brightness(104%) contrast(94%)" }
    : undefined;
  const initials = employeeName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const navigate = (
    nextTab: Tab,
    extra: { customer?: string; child?: string; article?: string; mode?: string; filterplan?: string; browse?: string } = {},
  ) => {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    if (extra.customer) params.set("customer", extra.customer);
    if (extra.child) params.set("child", extra.child);
    if (extra.article) params.set("article", extra.article);
    if (extra.mode) params.set("mode", extra.mode);
    if (extra.filterplan) params.set("filterplan", extra.filterplan);
    if (extra.browse) params.set("browse", extra.browse);
    const next = `${pathname}?${params.toString()}`;
    if (next === `${pathname}?${searchParams.toString()}`) return;
    // The employee page's server component performs auth and snapshot queries.
    // Updating its query string through the App Router re-ran those on every
    // tab tap. Next integrates the native History API with useSearchParams,
    // keeping in-panel navigation instant without repeating server reads.
    rememberInAppView(next);
    window.history.pushState(null, "", next);
  };
  const setTab = (id: Tab) => navigate(id);
  const handleNotificationLink = (url: string) => {
    const target = new URL(url, window.location.origin);
    const nextTab = target.searchParams.get("tab");
    if (nextTab === "floor") setTab("floor");
    else if (nextTab && VALID_TABS.includes(nextTab as Tab)) setTab(nextTab as Tab);
    else setTab("home");
  };

  const supabase = useMemo(() => createClient(), []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/employee/login");
  };

  const openCustomerDirectory = (customerKey: string, childId?: string) =>
    navigate("search", { customer: customerKey, child: childId });

  const openHelpArticle = (slug: string | null) =>
    navigate("help", { article: slug ?? undefined });

  const [searchOpen, setSearchOpen] = useState(false);
  const [punchOpen, setPunchOpen] = useState(false);
  const EMPLOYEE_SEARCH_NAV: SearchNavItem[] = [
    { id: "home", label: "Home", keywords: ["kids on site", "today"] },
    { id: "search", label: "Customers", keywords: ["customer", "directory", "members", "plans"] },
    {
      id: "activity",
      label: "Attendance",
      keywords: ["attendance", "punch history", "shift", "hours"],
    },
    { id: "settings", label: "Settings", keywords: ["notifications", "password", "theme", "sign out"] },
    { id: "help", label: "Help", keywords: ["faq", "how to"] },
  ];

  const renderActiveTab = () => {
    switch (tab) {
      case "home":
        return (
          <KidsCheckedInCard
            key="home"
            initialSessions={initialSessions.filter((s) => s.status === "active")}
            todayCheckinCount={todayCheckinCount}
            venueCapacity={venueCapacity}
            onViewAll={() => setTab("floor")}
            onOpenCustomerDirectory={openCustomerDirectory}
            variant="full"
          />
        );
      case "floor":
        return <LiveFloorView key="floor" initialSessions={initialSessions} loadOnMount={initialSessions.length === 0} />;
      case "help":
        return (
          <HelpTab
            key="help"
            isAdmin={false}
            initialSlug={helpArticleSlug}
            onOpenArticle={openHelpArticle}
          />
        );
      case "activity":
        return (
          <div className="space-y-4">
            <AttendanceCalendarTab employeeId={employeeId} shift={employeeShift} />
            <ShiftDetailsCard employeeId={employeeId} initialShift={employeeShift} onShiftLoaded={setEmployeeShift} />
          </div>
        );
      case "settings":
        return (
          <div className="space-y-3">
            <section className="rounded-2xl border border-white/10 bg-brand-nightSurface p-4">
              <h2 className="mb-3 text-sm font-semibold text-brand-nightText">Appearance</h2>
              <ThemeToggle />
            </section>
            <NotificationsCard />
            <ChangePasswordCard />
            <button type="button" onClick={handleSignOut} className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-brand-coral/20 bg-brand-coral/5 px-4 text-sm font-semibold text-brand-coral transition-colors hover:bg-brand-coral/10">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        );
      case "search":
        return (
          <Directory
            isAdmin={false}
            initialMode={directoryMode}
            initialQuery={customerSearchQuery}
            initialChildId={customerChildId}
            initialPlanId={directoryPlanId}
            initialBrowseAll={directoryBrowseAll}
            onOpenMembers={() => navigate("search", { mode: "members" })}
            onOpenPlan={(planId) => navigate("search", { filterplan: planId })}
            onOpenSearch={(query) => navigate("search", { customer: query })}
            onOpenAll={() => navigate("search", { browse: "all" })}
            onBack={() => navigate("search")}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="dark-ui min-h-screen bg-brand-nightBg">
      {/* Header — mirrors the admin panel's top bar: logo, identity block,
          search and notifications. Sticky so it stays put while a tab's
          content scrolls underneath it. */}
      <div className="sticky top-0 z-30 bg-brand-nightSurface border-b border-white/8">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => router.push("/")}
              aria-label="Go to home"
              className="shrink-0"
            >
              <img
                src="/logo-full.png"
                alt="QureoCity"
                className={`h-7 w-auto object-contain ${logoClass}`}
                style={logoStyle}
              />
            </button>
            <div className="w-px h-6 bg-white/10 shrink-0" />
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-brand-sky/20 text-brand-skyLight text-xs font-bold flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-brand-nightText/40 leading-none mb-0.5">
                  Welcome back
                </p>
                <p className="text-sm font-bold text-brand-nightText leading-tight truncate">
                  {employeeName}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="Search"
              aria-label="Search"
              className="text-brand-nightText/40 hover:text-brand-nightText p-2 rounded-lg transition-colors"
            >
              <Search size={16} />
            </button>
            <EmployeeNotificationBell onOpenLink={handleNotificationLink} />
          </div>
        </div>
      </div>

      {/* Content — Home shows only the Kids-on-site card; every other tab,
          including the full On Site list (reached via "View all" on that
          card), renders its own view. Bottom padding clears the tab bar. */}
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-28">
        {tab === "floor" && (
          <button
            type="button"
            onClick={() => setTab("home")}
            className="mb-3 text-xs font-semibold text-brand-nightText/45 hover:text-brand-skyLight transition-colors"
          >
            ← Back to Home
          </button>
        )}
        <PageTransition pageKey={tab}>{renderActiveTab()}</PageTransition>
      </div>

      {/* Real bottom tab bar — fixed, thumb-reachable, same active/badge
          language as the admin sidebar's nav items. */}
      <nav
        className="fixed left-3 right-3 z-40 mx-auto max-w-2xl rounded-2xl border border-white/15 bg-brand-nightSurface/95 p-1.5 shadow-2xl backdrop-blur-xl"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        aria-label="Employee panel navigation"
      >
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${TAB_META.length}, minmax(0, 1fr))`,
          }}
        >
          {TAB_META.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <motion.button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                }}
                aria-current={isActive ? "page" : undefined}
                whileTap={{ scale: 0.94 }}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 transition-colors ${
                  isActive
                    ? "text-brand-ink"
                    : "text-brand-nightText/45 hover:bg-white/[0.04] hover:text-brand-nightText"
                }`}
              >
                {isActive && <motion.span layoutId="employee-mobile-active-tab" transition={{ type: "spring", stiffness: 430, damping: 34 }} className={`absolute inset-0 rounded-xl border ${theme === "dark" ? "border-brand-sky bg-brand-sky" : "border-brand-sky/55 bg-brand-sky/30"}`} />}
                <span className="relative z-10"><Icon size={18} strokeWidth={2.25} /></span>
                <span className="relative z-10 text-[9.5px] font-semibold tracking-wide leading-none text-center">
                  {t.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </nav>
      {tab === "home" && (
        <motion.button
          type="button"
          onClick={() => setPunchOpen(true)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          aria-label="Scan staff QR to punch in or out"
          title="Scan staff QR"
          className="fixed z-40 grid h-12 w-12 place-items-center rounded-full border border-brand-sky/40 bg-brand-sky text-brand-ink shadow-lg shadow-black/25 transition-colors hover:brightness-105"
          style={{
            bottom: "calc(env(safe-area-inset-bottom) + 88px)",
            right: "max(1.25rem, calc((100vw - 42rem) / 2 + 1.25rem))",
          }}
        >
          <ScanLine size={19} strokeWidth={2.2} />
        </motion.button>
      )}
      <PushToast onNavigate={handleNotificationLink} />
      <BottomSheet open={punchOpen} onClose={() => setPunchOpen(false)} title="Staff punch">
        <PunchInFlow autoStart />
      </BottomSheet>
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        isAdmin={false}
        navItems={EMPLOYEE_SEARCH_NAV}
        onNavigate={(id) => navigate(id as Tab)}
        onOpenCustomer={openCustomerDirectory}
        onOpenHelp={openHelpArticle}
      />
    </div>
  );
}

export default function EmployeePanel(
  props: Parameters<typeof EmployeePanelInner>[0],
) {
  return (
    <Suspense fallback={null}>
      <EmployeePanelInner {...props} />
    </Suspense>
  );
}
