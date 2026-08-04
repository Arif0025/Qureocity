"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";

export default function ThemeToggle({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className={`inline-flex items-center justify-center rounded-lg transition-colors text-brand-nightText/50 hover:text-brand-nightText hover:bg-white/8 ${
        compact ? "w-8 h-8" : "gap-2 px-3 py-2"
      } ${className}`}
    >
      {isLight ? <Moon size={16} /> : <Sun size={16} />}
      {!compact && (
        <span className="text-xs font-semibold">
          {isLight ? "Dark mode" : "Light mode"}
        </span>
      )}
    </button>
  );
}
