"use client";

import {
  LayoutGrid,
  Users,
  UserRound,
  LogOut,
  Zap,
  Clock,
  MessageCircle,
  Settings,
  BadgeCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { usePendingRegistrationsCount } from "@/lib/hooks/usePendingRegistrationsCount";
import { useTheme } from "@/lib/hooks/useTheme";
import ThemeToggle from "@/components/shared/ThemeToggle";

export type AdminTabId =
  | "home"
  | "directory"
  | "memberships"
  | "staff"
  | "clubcheckin"
  | "pending"
  | "broadcast"
  | "settings";

const NAV_ITEMS: { id: AdminTabId; label: string; icon: typeof LayoutGrid }[] =
  [
    { id: "home", label: "Overview", icon: LayoutGrid },
    { id: "directory", label: "Directory", icon: Users },
    { id: "memberships", label: "Memberships", icon: BadgeCheck },
    { id: "staff", label: "Staff", icon: UserRound },
    { id: "broadcast", label: "Broadcast", icon: MessageCircle },
    { id: "settings", label: "Settings", icon: Settings },
  ];

// Order tuned for the mobile bottom bar specifically: the two
// single-purpose actions (Pending, Club check-in) are surfaced right
// after Home/Directory since they're used constantly during a shift,
// rather than being buried at the end like they are in the desktop list.
const BOTTOM_NAV_ITEMS: {
  id: AdminTabId;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { id: "home", label: "Overview", icon: LayoutGrid },
  { id: "directory", label: "Directory", icon: Users },
  { id: "pending", label: "Pending", icon: Clock },
  { id: "clubcheckin", label: "Club", icon: Zap },
  { id: "memberships", label: "Members", icon: BadgeCheck },
  { id: "staff", label: "Staff", icon: UserRound },
  { id: "broadcast", label: "Broadcast", icon: MessageCircle },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar({
  active,
  onSelect,
  employeeName,
  onSignOut,
}: {
  active: AdminTabId;
  onSelect: (id: AdminTabId) => void;
  employeeName: string;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const pendingCount = usePendingRegistrationsCount();
  const { theme } = useTheme();
  // logo-full.png is purple/gold on transparent — brightness-0 invert is
  // a CSS trick to force it white for the dark canvas. On light theme
  // the canvas is white/lavender, so the original purple/gold render is
  // correct as-is and the filter needs to come off.
  const logoClass =
    theme === "light" ? "opacity-95" : "brightness-0 invert opacity-95";

  const initials = employeeName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const NavContent = (
    <>
      <div className="px-5 pt-6 pb-8">
        <button type="button" onClick={() => router.push("/")}>
          <img
            src="/logo-full.png"
            alt="QureoCity"
            className={`h-7 ${logoClass}`}
          />
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-sky/20 text-brand-skyLight"
                  : "text-brand-nightText/55 hover:bg-white/[0.04] hover:text-brand-nightText"
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Frequent single-purpose actions, not browsing destinations —
          kept out of the main nav list on purpose. */}
      <div className="px-3 pb-3 space-y-1.5">
        <button
          onClick={() => onSelect("pending")}
          className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold border transition-colors ${
            active === "pending"
              ? "border-brand-coral/40 bg-brand-coral/15 text-brand-coral"
              : "border-white/10 text-brand-nightText/45 hover:border-brand-coral/40 hover:text-brand-coral"
          }`}
        >
          <Clock size={16} strokeWidth={2} />
          Pending
          {pendingCount > 0 && (
            <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-brand-coral text-white text-[10px] font-bold flex items-center justify-center">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onSelect("clubcheckin")}
          className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold border transition-colors ${
            active === "clubcheckin"
              ? "border-brand-sky/40 bg-brand-sky/15 text-brand-skyLight"
              : "border-white/10 text-brand-nightText/45 hover:border-brand-sky/40 hover:text-brand-skyLight"
          }`}
        >
          <Zap size={16} strokeWidth={2} />
          Club check-in
        </button>
      </div>

      <div className="px-3 pb-5 pt-3 border-t border-white/8">
        <div className="px-1 pb-2">
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-brand-sky/20 text-brand-skyLight text-xs font-bold flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-brand-nightText truncate">
              {employeeName}
            </p>
            <p className="text-xs text-brand-nightText/40">Admin</p>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="text-brand-nightText/30 hover:text-brand-coral p-1.5 rounded-lg transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar — identity + utilities only. Tab navigation lives
          in the bottom bar now, so there's no hamburger/drawer here: every
          destination is reachable in a single tap from the bottom bar,
          the same pattern the employee panel already uses. */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-brand-nightSurface border-b border-white/8 px-4 py-3">
        <button type="button" onClick={() => router.push("/")}>
          <img
            src="/logo-full.png"
            alt="QureoCity"
            className={`h-6 ${logoClass}`}
          />
        </button>
        <div className="flex items-center gap-1">
          <ThemeToggle compact />
          <button
            onClick={onSignOut}
            title="Sign out"
            className="text-brand-nightText/50 hover:text-brand-coral p-2 rounded-lg transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Mobile bottom tab bar — horizontally scrollable so all 8
          destinations fit and stay reachable with a single tap, no
          nested "More" menu. Snap-scrolling keeps each icon aligned
          under a thumb swipe. */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-brand-nightSurface border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
        aria-label="Admin navigation"
      >
        <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory px-1 py-1.5">
          {BOTTOM_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            const showBadge = item.id === "pending" && pendingCount > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 min-w-[70px] shrink-0 snap-start min-h-[52px] rounded-xl px-1 mx-0.5 transition-colors ${
                  isActive
                    ? "bg-brand-sky/20 text-brand-skyLight"
                    : "text-brand-nightText/45 hover:bg-white/[0.04] hover:text-brand-nightText"
                }`}
              >
                <span className="relative">
                  <Icon size={17} strokeWidth={2.25} />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-brand-coral text-white text-[9px] font-bold flex items-center justify-center">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </span>
                <span className="text-[9.5px] font-semibold tracking-wide leading-none text-center">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:h-screen md:sticky md:top-0 border-r border-white/8 bg-brand-nightSurface">
        {NavContent}
      </aside>
    </>
  );
}
