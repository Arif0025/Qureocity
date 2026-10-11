"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { tabContent } from "@/lib/motion";

// Wraps whatever a tab/section renders so switching between them
// crossfades instead of hard-cutting. `pageKey` must change whenever the
// visible content changes (the tab id is usually right) — that's what
// tells Framer Motion this is a different "page" to transition between,
// not an update to the current one.
export default function PageTransition({
  pageKey,
  children,
}: {
  pageKey: string;
  children: ReactNode;
}) {
  return (
    <motion.div key={pageKey} {...tabContent} initial={false}>
      {children}
    </motion.div>
  );
}
