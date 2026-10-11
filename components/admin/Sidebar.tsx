"use client";

import {
  LayoutGrid,
  Users,
  UserRound,
  Settings,
  BadgeCheck,
  Search,
  Bell,
  HelpCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { usePendingRegistrationsCount } from "@/lib/hooks/usePendingRegistrationsCount";
import { useTheme } from "@/lib/hooks/useTheme";

export type AdminTabId =
  | "home"
  | "directory"
  | "notifications"
  | "memberships"
  | "staff"
  | "settings"
  | "help";

const NAV_ITEMS: { id: AdminTabId; label: string; icon: typeof LayoutGrid }[] =
  [
    { id: "home", label: "Overview", icon: LayoutGrid },
    { id: "directory", label: "Customers", icon: Users },
    { id: "memberships", label: "Plans", icon: BadgeCheck },
    { id: "staff", label: "Staff", icon: UserRound },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "help", label: "Help", icon: HelpCircle },
  ];

// Order tuned for the mobile bottom bar: daily overview and frequent
// actions stay reachable, while registration requests have a dedicated inbox.
const BOTTOM_NAV_ITEMS: {
  id: AdminTabId;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { id: "home", label: "Overview", icon: LayoutGrid },
  { id: "directory", label: "Customers", icon: Users },
  { id: "memberships", label: "Plans", icon: BadgeCheck },
  { id: "staff", label: "Staff", icon: UserRound },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar({
  active,
  onSelect,
  onNotificationsClick,
  employeeName,
  onSearchClick,
}: {
  active: AdminTabId;
  onSelect: (id: AdminTabId) => void;
  onNotificationsClick: () => void;
  employeeName: string;
  onSearchClick: () => void;
}) {
  const router = useRouter();
  const pendingCount = usePendingRegistrationsCount();
  const { theme } = useTheme();
  // Keep the mark warm ivory against the charcoal theme rather than pure white.
  const logoClass = "opacity-95";
  const logoStyle = theme === "dark"
    ? { filter: "brightness(0) saturate(100%) invert(97%) sepia(18%) saturate(390%) hue-rotate(350deg) brightness(104%) contrast(94%)" }
    : undefined;

  const initials = employeeName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const NavContent = (
    <>
      <div className="px-5 pt-6 pb-8 flex items-center justify-between gap-2">
        <button type="button" onClick={() => router.push("/")}>
          <img
            src="/logo-full.png"
            alt="QureoCity"
            className={`h-7 ${logoClass}`}
            style={logoStyle}
          />
        </button>
        <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSearchClick}
          title="Search"
          aria-label="Search"
          className="text-brand-nightText/40 hover:text-brand-nightText p-1.5 rounded-lg transition-colors"
        >
          <Search size={18} />
        </button>
        <button type="button" onClick={onNotificationsClick} title="Notifications" aria-label={`Notifications${pendingCount ? `, ${pendingCount} pending registrations` : ""}`} className="relative text-brand-nightText/40 hover:text-brand-nightText p-1.5 rounded-lg transition-colors">
          <Bell size={18} />
          {pendingCount > 0 && <span className="absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-brand-coral px-1 text-[9px] font-bold leading-none text-white ring-2 ring-brand-nightSurface">{pendingCount > 9 ? "9+" : pendingCount}</span>}
        </button>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`relative w-full flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? theme === "dark"
                    ? "border-brand-sky/80 bg-brand-sky text-brand-ink shadow-sm"
                    : "border-brand-sky/50 bg-brand-sky/30 text-brand-ink shadow-sm"
                  : "text-brand-nightText/55 hover:bg-white/[0.04] hover:text-brand-nightText"
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              {item.label}
              {item.id === "notifications" && pendingCount > 0 && <span className="ml-auto rounded-full bg-brand-coral px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{pendingCount > 99 ? "99+" : pendingCount}</span>}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-5 pt-3 border-t border-white/8">
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
            style={logoStyle}
          />
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={onSearchClick}
            title="Search"
            aria-label="Search"
            className="text-brand-nightText/50 hover:text-brand-nightText p-2 rounded-lg transition-colors"
          >
            <Search size={18} />
          </button>
          <button type="button" onClick={onNotificationsClick} title="Notifications" aria-label={`Notifications${pendingCount ? `, ${pendingCount} pending registrations` : ""}`} className="relative text-brand-nightText/50 hover:text-brand-nightText p-2 rounded-lg transition-colors">
            <Bell size={18} />
            {pendingCount > 0 && <span className="absolute right-0 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-brand-coral px-1 text-[9px] font-bold leading-none text-white ring-2 ring-brand-nightSurface">{pendingCount > 9 ? "9+" : pendingCount}</span>}
          </button>
        </div>
      </div>

      {/* Floating, thumb-reachable mobile navigation. */}
      <nav
        className="md:hidden fixed left-3 right-3 z-40 mx-auto max-w-lg rounded-2xl border border-white/15 bg-brand-nightSurface/95 p-1.5 shadow-2xl backdrop-blur-xl"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        aria-label="Admin navigation"
      >
        <div className="grid grid-cols-5 gap-1">
          {BOTTOM_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                whileTap={{ scale: 0.94 }}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 transition-colors ${
                  isActive
                    ? "text-brand-ink"
                    : "text-brand-nightText/55 hover:bg-white/[0.04] hover:text-brand-nightText"
                }`}
              >
                {isActive && <motion.span layoutId="admin-mobile-active-tab" transition={{ type: "spring", stiffness: 430, damping: 34 }} className={`absolute inset-0 rounded-xl border ${theme === "dark" ? "border-brand-sky bg-brand-sky" : "border-brand-sky/55 bg-brand-sky/30"}`} />}
                <span className="relative z-10">
                  <Icon size={18} strokeWidth={2.25} />
                  {item.id === "notifications" && pendingCount > 0 && <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-brand-coral text-white text-[9px] font-bold flex items-center justify-center">{pendingCount > 9 ? "9+" : pendingCount}</span>}
                </span>
                <span className="relative z-10 text-[9.5px] font-semibold tracking-wide leading-none text-center">
                  {item.label}
                </span>
              </motion.button>
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
