"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, ChevronDown, Settings2, UserPlus } from "lucide-react";
import PendingList from "./PendingList";
import PushDeliveryLog from "./PushDeliveryLog";
import PartyBookingRequests from "./PartyBookingRequests";
import RegistrationReviewHistory from "./RegistrationReviewHistory";
import MembershipExpiryAlerts from "./MembershipExpiryAlerts";
import LeaveRequestsManager from "./LeaveRequestsManager";
import { expandCollapse } from "@/lib/motion";
import { createClient } from "@/lib/supabase/client";

export default function AdminNotifications({ onOpenSettings }: { onOpenSettings: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [showActivity, setShowActivity] = useState(false);
  const [showRegistrations, setShowRegistrations] = useState(false);
  const [registrationCount, setRegistrationCount] = useState(0);
  const refreshRegistrationCount = useCallback(async () => {
    const { count } = await supabase.from("membership_registrations").select("id", { count: "exact", head: true }).eq("status", "pending");
    setRegistrationCount(count ?? 0);
  }, [supabase]);

  useEffect(() => {
    void refreshRegistrationCount();
    const channel = supabase.channel("admin-notifications-registration-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "membership_registrations" }, refreshRegistrationCount)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, refreshRegistrationCount]);

  return (
    <div className="space-y-5">
      <LeaveRequestsManager />
      <section className="overflow-hidden rounded-2xl border border-brand-sky/20 bg-brand-nightSurface shadow-sm">
        <button type="button" aria-expanded={showRegistrations} onClick={() => setShowRegistrations((value) => !value)} className="flex min-h-16 w-full items-center gap-3 bg-brand-sky/[0.06] px-4 py-4 text-left sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-sky/15 text-brand-skyLight">
            <UserPlus size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-brand-nightText">New registrations</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-brand-nightText/45">
              Membership, renewal, and special-day requests waiting for review.
            </p>
          </div>
          {registrationCount > 0 && <span aria-label={`${registrationCount} pending registrations`} className="grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-brand-sun/15 px-2.5 text-xs font-bold tabular-nums text-brand-sun">{registrationCount}</span>}
          <ChevronDown size={17} className={`mt-1 shrink-0 text-brand-nightText/40 transition-transform ${showRegistrations ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence initial={false}>{showRegistrations && <motion.div {...expandCollapse} className="overflow-hidden"><div className="space-y-3 border-t border-white/[0.07] p-3 sm:p-5">
          <PendingList onCountChange={setRegistrationCount} />
          <MembershipExpiryAlerts embedded />
        </div></motion.div>}</AnimatePresence>
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
