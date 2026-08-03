"use client";

import {
  LayoutGrid,
  Users,
  UserRound,
  LogOut,
  Zap,
  X,
  Menu,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type AdminTabId = "home" | "customers" | "staff" | "clubcheckin";

const NAV_ITEMS: { id: AdminTabId; label: string; icon: typeof LayoutGrid }[] =
  [
    { id: "home", label: "Home", icon: LayoutGrid },
    { id: "customers", label: "Customers", icon: Users },
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
            className="h-7 brightness-0 invert opacity-95"
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
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
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
            className="h-6 brightness-0 invert opacity-95"
          />
        </button>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 text-brand-nightText/60"
        >
          <Menu size={22} />
        </button>
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
