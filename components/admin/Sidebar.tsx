"use client";

import {
  LayoutGrid,
  Users,
  UserRound,
  LogOut,
  Zap,
  X,
  Menu,
  Clock,
  MessageCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePendingCount } from "@/lib/hooks/usePendingCount";
import { usePendingRegistrationsCount } from "@/lib/hooks/usePendingRegistrationsCount";
import { useTheme } from "@/lib/hooks/useTheme";
import ThemeToggle from "@/components/shared/ThemeToggle";

export type AdminTabId =
  | "home"
  | "customers"
  | "staff"
  | "clubcheckin"
  | "pending"
  | "broadcast";

const NAV_ITEMS: { id: AdminTabId; label: string; icon: typeof LayoutGrid }[] =
  [
    { id: "home", label: "Home", icon: LayoutGrid },
    { id: "pending", label: "Pending", icon: Clock },
    { id: "customers", label: "Customers", icon: Users },
    { id: "broadcast", label: "Broadcast", icon: MessageCircle },
    { id: "staff", label: "Staff", icon: UserRound },
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const pendingCount = usePendingCount() + usePendingRegistrationsCount();
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
              onClick={() => {
                onSelect(item.id);
                setMobileOpen(false);
              }}
              className={`relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-sky/20 text-brand-skyLight"
                  : "text-brand-nightText/55 hover:bg-white/[0.04] hover:text-brand-nightText"
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              {item.label}
              {item.id === "pending" && pendingCount > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-brand-coral text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <button
          onClick={() => {
            onSelect("clubcheckin");
            setMobileOpen(false);
          }}
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
      {/* Mobile top bar */}
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
            onClick={() => setMobileOpen(true)}
            className="p-2 text-brand-nightText/60"
          >
            <Menu size={22} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 bg-brand-nightSurface h-full flex flex-col shadow-xl animate-popIn">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-5 right-4 text-brand-nightText/40"
            >
              <X size={20} />
            </button>
            {NavContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:h-screen md:sticky md:top-0 border-r border-white/8 bg-brand-nightSurface">
        {NavContent}
      </aside>
    </>
  );
}
