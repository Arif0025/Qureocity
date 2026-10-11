"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, ChevronDown, Settings2, UserPlus } from "lucide-react";
import PendingList from "./PendingList";
import PushDeliveryLog from "./PushDeliveryLog";
import PartyBookingRequests from "./PartyBookingRequests";
import RegistrationReviewHistory from "./RegistrationReviewHistory";
import MembershipExpiryAlerts from "./MembershipExpiryAlerts";
import { expandCollapse } from "@/lib/motion";

export default function AdminNotifications({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [showActivity, setShowActivity] = useState(false);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-brand-sky/20 bg-brand-nightSurface shadow-sm">
        <header className="flex items-start gap-3 border-b border-white/[0.07] bg-brand-sky/[0.06] px-4 py-4 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-sky/15 text-brand-skyLight">
            <UserPlus size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-brand-nightText">New registrations</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-brand-nightText/45">
              Membership, renewal, and special-day requests waiting for review.
            </p>
          </div>
          <BellRing size={16} className="mt-1 shrink-0 text-brand-skyLight/70" />
        </header>
        <div className="space-y-3 p-3 sm:p-5">
          <PendingList />
          <MembershipExpiryAlerts embedded />
        </div>
      </section>

      <PartyBookingRequests />
      <RegistrationReviewHistory />

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-brand-nightSurface">
        <button
          type="button"
          aria-expanded={showActivity}
          onClick={() => setShowActivity((value) => !value)}
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left sm:px-5"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.04] text-brand-nightText/45">
            <BellRing size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-brand-nightText/75">Other notification activity</span>
            <span className="block text-xs text-brand-nightText/35">Recent push delivery history</span>
          </span>
          <ChevronDown size={16} className={`text-brand-nightText/40 transition-transform ${showActivity ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence initial={false}>{showActivity && <motion.div {...expandCollapse} className="overflow-hidden"><div className="border-t border-white/[0.07] p-3 sm:p-5"><PushDeliveryLog /></div></motion.div>}</AnimatePresence>
      </section>

      <button type="button" onClick={onOpenSettings} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-medium text-brand-nightText/45 transition-colors hover:bg-white/[0.04] hover:text-brand-nightText/75">
        <Settings2 size={14} /> Notification delivery preferences are in Settings
      </button>
    </div>
  );
}
