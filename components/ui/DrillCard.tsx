"use client";

import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { expandCollapse, tapScale, DURATION } from "@/lib/motion";

// The one card shape used everywhere a list shows a "glance" row that
// opens into full detail in place — customers in the Directory, plans,
// staff rows on Team Today. One component, one feel, everywhere:
// building each of those as its own bespoke card is exactly how the app
// ends up looking inconsistent and half-finished.
//
// `header` is always visible — the glance view. `children` is the
// drill-down content, mounted and animated open only when `expanded` is
// true (so a long list doesn't pay the cost of rendering detail content
// for rows nobody has opened).
export default function DrillCard({
  expanded,
  onToggle,
  header,
  accessory,
  children,
  className = "",
}: {
  expanded: boolean;
  onToggle: () => void;
  // The glance content — name, key facts. Keep it to what someone needs
  // to recognize the row and decide whether to open it.
  header: ReactNode;
  // Optional trailing element in the collapsed row (a badge, a count) —
  // rendered outside the tap target's text flow, before the chevron.
  accessory?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      layout
      transition={{ duration: DURATION.fast }}
      className={`bg-brand-nightSurface rounded-xl2 border border-white/10 overflow-hidden ${className}`}
    >
      <motion.button
        type="button"
        onClick={onToggle}
        whileTap={tapScale}
        aria-expanded={expanded}
        className="w-full min-h-[56px] flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex-1 min-w-0">{header}</div>
        {accessory}
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: DURATION.fast }}
          className="text-brand-nightText/35 shrink-0"
        >
          <ChevronDown size={18} />
        </motion.span>
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded && children && (
          <motion.div {...expandCollapse} className="overflow-hidden">
            <div className="px-4 pb-4 pt-1 border-t border-white/10 bg-white/[0.02]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
