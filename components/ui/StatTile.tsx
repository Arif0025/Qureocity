"use client";

import { motion } from "framer-motion";
import { DURATION } from "@/lib/motion";

// A single number-with-label block — the building piece for Overview's
// check-in split, and later Finance's revenue/expense figures. Stacks
// into a responsive grid naturally; put 2-4 in a flex/grid wrapper.
export default function StatTile({
  label,
  value,
  tone = "default",
  sublabel,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "leaf" | "coral" | "sky";
  sublabel?: string;
}) {
  const valueColor =
    tone === "leaf"
      ? "text-brand-leaf"
      : tone === "coral"
        ? "text-brand-coral"
        : tone === "sky"
          ? "text-brand-skyLight"
          : "text-brand-nightText";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base }}
      className="bg-brand-nightSurface rounded-xl2 border border-white/10 px-4 py-3.5 min-w-0"
    >
      <p className="text-xs font-semibold text-brand-nightText/45 uppercase tracking-wide truncate">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-0.5 ${valueColor}`}>{value}</p>
      {sublabel && (
        <p className="text-xs text-brand-nightText/40 mt-0.5 truncate">
          {sublabel}
        </p>
      )}
    </motion.div>
  );
}
