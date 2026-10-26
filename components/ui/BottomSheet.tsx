"use client";

import { ReactNode, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import {
  sheetBackdrop,
  sheetPanelMobile,
  sheetPanelDesktop,
} from "@/lib/motion";

// The one popup shape for quick actions and small forms — the Notify
// canvas, confirmations, anything that isn't a full screen. Slides up
// from the bottom on a phone (reachable with a thumb), appears as a
// centered panel on a wider screen — one component, both behaviors.
export default function BottomSheet({
  open,
  onClose,
  title,
  floatAboveBottom = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  floatAboveBottom?: boolean;
  children: ReactNode;
}) {
  // matchMedia reads window, so this starts false (mobile layout) during
  // SSR/hydration and corrects itself on mount — no layout flash, since
  // the sheet is closed until opened anyway.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    setIsDesktop(mq.matches);
    const onChange = () => setIsDesktop(mq.matches);
    // Safari < 14 only has the deprecated addListener/removeListener.
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...sheetBackdrop}
          className={`fixed inset-0 z-50 bg-black/50 flex ${floatAboveBottom ? "items-center justify-center p-3" : "items-end justify-center sm:items-center"}`}
          onClick={onClose}
        >
          <motion.div
            {...(isDesktop || floatAboveBottom ? sheetPanelDesktop : sheetPanelMobile)}
            onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-sm bg-brand-nightSurface ${floatAboveBottom ? "rounded-2xl" : "rounded-t-2xl sm:rounded-2xl"} shadow-2xl max-h-[85vh] overflow-y-auto`}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 sticky top-0 bg-brand-nightSurface">
              <p className="font-bold text-brand-nightText">{title}</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-brand-nightText/40 hover:text-brand-nightText rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
