"use client";

import { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type ListRowFact = {
  icon?: ReactNode;
  value: ReactNode;
  /** Hidden on the narrowest screens — only the most essential facts show there. */
  hideOnMobile?: boolean;
};

/**
 * The one row shape every list in the app shares:
 * identity -> operational facts -> immediate action -> safety signal -> expand.
 *
 * Desktop: a clear single-line row, facts laid out left to right.
 * Mobile: identity + safety signal on line one, facts wrap to line two,
 * the action stays pinned to the right on both.
 */
export default function ListRow({
  avatar,
  title,
  subtitle,
  statusDot,
  facts = [],
  action,
  safetyFlag,
  expanded,
  onToggleExpand,
  expandedContent,
  accent = "default",
}: {
  avatar?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  statusDot?: "leaf" | "sun" | "coral" | "sky" | "muted";
  facts?: ListRowFact[];
  action?: ReactNode;
  safetyFlag?: ReactNode;
  expanded?: boolean;
  onToggleExpand?: () => void;
  expandedContent?: ReactNode;
  accent?: "default" | "muted";
}) {
  const dotClass: Record<string, string> = {
    leaf: "bg-brand-leaf",
    sun: "bg-brand-sun",
    coral: "bg-brand-coral",
    sky: "bg-brand-sky",
    muted: "bg-brand-ink/20",
  };

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-colors ${
        accent === "muted"
          ? "border-white/10 bg-white/[0.02]"
          : "border-white/10 bg-brand-nightSurface2"
      }`}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {avatar}

        <button
          type="button"
          onClick={onToggleExpand}
          disabled={!onToggleExpand}
          className="flex items-center gap-2 min-w-0 flex-1 text-left disabled:cursor-default"
        >
          {statusDot && (
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass[statusDot]}`}
            />
          )}
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-brand-nightText truncate">
                {title}
              </span>
              {safetyFlag}
            </span>
            {subtitle && (
              <span className="block text-xs text-brand-nightText/40 truncate">
                {subtitle}
              </span>
            )}
          </span>
        </button>

        {facts.length > 0 && (
          <div className="hidden sm:flex items-center gap-4 shrink-0">
            {facts.map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-1 text-xs text-brand-nightText/50 whitespace-nowrap"
              >
                {f.icon}
                {f.value}
              </span>
            ))}
          </div>
        )}

        {action}

        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? "Collapse details" : "Expand details"}
            className="shrink-0 p-1 text-brand-nightText/25 hover:text-brand-sky transition-colors"
          >
            <ChevronDown
              size={15}
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Mobile-only second line for facts that don't fit the compact row */}
      {facts.length > 0 && (
        <div className="sm:hidden flex items-center gap-3 px-3.5 pb-2 -mt-1 flex-wrap">
          {facts
            .filter((f) => !f.hideOnMobile)
            .map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-1 text-[11px] text-brand-nightText/45"
              >
                {f.icon}
                {f.value}
              </span>
            ))}
        </div>
      )}

      {expanded && expandedContent && (
        <div className="px-3.5 pb-3.5 pt-2.5 border-t border-white/10 bg-white/[0.02]">
          {expandedContent}
        </div>
      )}
    </div>
  );
}
