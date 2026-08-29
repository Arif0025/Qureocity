"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Fingerprint,
  Zap,
  Home as HomeIcon,
  Search as SearchIcon,
  CalendarClock,
  LogOut,
} from "lucide-react";
import PunchInFlow from "./PunchInFlow";
import QuickCheckin from "./QuickCheckin";
import LiveFloorView from "@/components/admin/LiveFloorView";
import KidsCheckedInCard, {
  SessionRow,
} from "@/components/admin/home/KidsCheckedInCard";
import CustomerSearch from "@/components/shared/CustomerSearch";
import AttendanceCalendarTab from "./AttendanceCalendarTab";
import AttendanceSummaryCard from "./AttendanceSummaryCard";
import ShiftDetailsCard from "./ShiftDetailsCard";
import { useTheme } from "@/lib/hooks/useTheme";
import ThemeToggle from "@/components/shared/ThemeToggle";

function ChangePasswordCard() {
  const supabase = createClient();
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
  { id: "quickcheckin", label: "Club check-in", icon: Zap },
  { id: "punch", label: "Punch", icon: Fingerprint },
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "activity", label: "Attendance", icon: CalendarClock },
] as const;

type Tab = (typeof TAB_META)[number]["id"] | "floor";

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

  const VALID_TABS = TAB_META.map((t) => t.id) as Tab[];
  const tabFromUrl = searchParams.get("tab") as Tab | null;
  const [tab, setTabState] = useState<Tab>(
    tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : "home",
  );
  const [customerSearchQuery, setCustomerSearchQuery] = useState(
    searchParams.get("customer") ?? "",
  );
  const { theme } = useTheme();
  const logoClass =
    theme === "light"
      ? "opacity-90 hover:opacity-100 transition-opacity"
      : "brightness-0 invert opacity-90 hover:opacity-100 transition-opacity";
  const initials = employeeName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const setTab = (id: Tab) => {
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

  const openCustomerDirectory = (customerKey: string) => {
    setCustomerSearchQuery(customerKey);
    setTab("search");
  };

  const renderActiveTab = () => {
    switch (tab) {
      case "home":
        return (
          <KidsCheckedInCard
            key="home"
            initialSessions={initialSessions.filter(
              (s) => s.status === "active",
            )}
            todayCheckinCount={todayCheckinCount}
            venueCapacity={venueCapacity}
            onViewAll={() => setTab("floor")}
            onOpenCustomerDirectory={openCustomerDirectory}
          />
        );
      case "quickcheckin":
        return <QuickCheckin key="quickcheckin" />;
      case "floor":
        return (
          <LiveFloorView
            key="floor"
            initialSessions={initialSessions}
          />
        );
      case "activity":
        return (
          <div className="space-y-4">
            <AttendanceSummaryCard key="activity" employeeId={employeeId} />
            <AttendanceCalendarTab employeeId={employeeId} />
            <ShiftDetailsCard employeeId={employeeId} />
            <ChangePasswordCard />
          </div>
        );
      case "search":
        return (
          <CustomerSearch
            key="search"
            isAdmin={false}
            initialQuery={customerSearchQuery}
            focusCustomerPhone={customerSearchQuery}
          />
        );
      case "punch":
      default:
        return <PunchInFlow key="punch" />;
    }
  };

  return (
    <div className="dark-ui min-h-screen bg-brand-nightBg">
      {/* Header — mirrors the admin panel's top bar: logo, identity block,
          theme toggle, sign out. Sticky so it stays put while a tab's
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
            <ThemeToggle compact />
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="text-brand-nightText/40 hover:text-brand-coral p-2 rounded-lg transition-colors"
            >
              <LogOut size={16} />
            </button>
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
        {renderActiveTab()}
      </div>

      {/* Real bottom tab bar — fixed, thumb-reachable, same active/badge
          language as the admin sidebar's nav items. */}
      <nav
        className="fixed bottom-0 inset-x-0 z-30 bg-brand-nightSurface border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
        aria-label="Employee panel navigation"
      >
        <div className="max-w-2xl mx-auto px-2 py-1.5 grid grid-cols-6 gap-1">
          {TAB_META.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                }}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl px-1 transition-colors ${
                  isActive
                    ? "bg-brand-sky/20 text-brand-skyLight"
                    : "text-brand-nightText/45 hover:bg-white/[0.04] hover:text-brand-nightText"
                }`}
              >
                <Icon size={17} strokeWidth={2.25} />
                <span className="text-[9.5px] font-semibold tracking-wide leading-none text-center">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
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
