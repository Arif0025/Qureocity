"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Fingerprint,
  Zap,
  Users,
  Clock,
  Search as SearchIcon,
  CalendarClock,
} from "lucide-react";
import PunchInFlow from "./PunchInFlow";
import QuickCheckin from "./QuickCheckin";
import LiveFloorView from "@/components/admin/LiveFloorView";
import KidsCheckedInCard, {
  SessionRow,
} from "@/components/admin/home/KidsCheckedInCard";
import CustomerSearch from "@/components/shared/CustomerSearch";
import AttendanceCalendarTab from "./AttendanceCalendarTab";
import MyPerformanceGlimpse from "./MyPerformanceGlimpse";
import ShiftDetailsCard from "./ShiftDetailsCard";
import PendingConfirmations from "@/components/shared/PendingConfirmations";
import { usePendingCount } from "@/lib/hooks/usePendingCount";
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

const TAB_META = [
  { id: "floor", label: "On Site", icon: Users },
  { id: "pending", label: "Pending", icon: Clock },
  { id: "quickcheckin", label: "Club check-in", icon: Zap },
  { id: "punch", label: "Punch", icon: Fingerprint },
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "activity", label: "Attendance", icon: CalendarClock },
] as const;

type Tab = (typeof TAB_META)[number]["id"];

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

  const VALID_TABS = TAB_META.map((t) => t.id);
  const tabFromUrl = searchParams.get("tab") as Tab | null;
  const [tab, setTabState] = useState<Tab>(
    tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : "floor",
  );
  const [focusPendingId, setFocusPendingId] = useState<string | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState(
    searchParams.get("customer") ?? "",
  );
  const pendingCount = usePendingCount();
  const { theme } = useTheme();
  const logoClass =
    theme === "light"
      ? "opacity-90 hover:opacity-100 transition-opacity"
      : "brightness-0 invert opacity-90 hover:opacity-100 transition-opacity";

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

  const goToPending = (sessionId: string) => {
    setFocusPendingId(sessionId);
    setTab("pending");
  };

  const openCustomerDirectory = (customerKey: string) => {
    setCustomerSearchQuery(customerKey);
    setTab("search");
  };

  const renderActiveTab = () => {
    switch (tab) {
      case "quickcheckin":
        return <QuickCheckin key="quickcheckin" />;
      case "floor":
        return (
          <LiveFloorView
            key="floor"
            initialSessions={initialSessions}
            onPendingClick={goToPending}
          />
        );
      case "pending":
        return (
          <PendingConfirmations key="pending" focusSessionId={focusPendingId} />
        );
      case "activity":
        return (
          <div className="space-y-4">
            <AttendanceCalendarTab key="activity" employeeId={employeeId} />
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
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-10">
        {/* Header: compact logo, greeting, sign out */}
        <div className="flex items-center justify-between gap-3 mb-4">
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
                className={`h-9 w-auto object-contain ${logoClass}`}
              />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-brand-nightText/40 leading-none">
                Welcome
              </p>
              <p className="font-bold text-brand-nightText leading-tight truncate">
                {employeeName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ThemeToggle compact />
            <button
              onClick={handleSignOut}
              className="text-sm text-brand-nightText/40 hover:text-brand-coral font-medium whitespace-nowrap px-1"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="mb-4">
          <KidsCheckedInCard
            initialSessions={initialSessions.filter(
              (s) => s.status === "active",
            )}
            todayCheckinCount={todayCheckinCount}
            venueCapacity={venueCapacity}
            onViewAll={() => setTab("floor")}
            onOpenCustomerDirectory={openCustomerDirectory}
          />
        </div>
        <div className="mb-4">
          <MyPerformanceGlimpse
            employeeId={employeeId}
            onClick={() => setTab("activity")}
          />
        </div>
        <div className="grid grid-cols-6 gap-1 mb-6 bg-brand-nightSurface rounded-2xl p-1 border border-white/10 shadow-sm">
          {TAB_META.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (t.id !== "pending") setFocusPendingId(null);
                  setTab(t.id);
                }}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl px-1 transition-colors ${
                  isActive
                    ? "bg-brand-sky text-white shadow-sm"
                    : "text-brand-nightText/50 hover:text-brand-nightText"
                }`}
              >
                <Icon size={16} strokeWidth={2.25} />
                <span className="text-[9px] font-semibold tracking-wide leading-none text-center">
                  {t.label}
                </span>
                {t.id === "pending" && pendingCount > 0 && (
                  <span className="absolute top-1 right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-brand-coral text-white text-[9px] font-bold flex items-center justify-center">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {renderActiveTab()}
      </div>
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
