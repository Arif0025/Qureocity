"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, BadgeCheck, CalendarDays, Plus, Search, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import CustomerSearch from "@/components/shared/CustomerSearch";
import { tapScale } from "@/lib/motion";
import { planCardTone } from "./planCardTones";
import AddCustomerModal from "./AddCustomerModal";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  plan_type: "recurring" | "special";
  event_date: string | null;
  active: boolean;
  price: number;
};

type View = "landing" | "members" | "plan" | "search" | "all";

export default function Directory({
  isAdmin,
  initialMode = "all",
  initialQuery = "",
  initialChildId,
  initialPlanId,
  initialNewOnly,
  initialExpiringOnly,
  initialExpiredOnly,
  initialBrowseAll = false,
  onOpenMembers,
  onOpenPlan,
  onOpenSearch,
  onOpenAll,
  onBack,
}: {
  isAdmin: boolean;
  initialMode?: "all" | "members";
  initialQuery?: string;
  initialChildId?: string;
  initialPlanId?: string;
  initialNewOnly?: boolean;
  initialExpiringOnly?: boolean;
  initialExpiredOnly?: boolean;
  initialBrowseAll?: boolean;
  onOpenMembers: () => void;
  onOpenPlan: (planId: string) => void;
  onOpenSearch: (query: string) => void;
  onOpenAll: () => void;
  onBack: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  const view: View = initialPlanId
    ? "plan"
    : initialMode === "members"
      ? "members"
      : initialQuery.trim()
        ? "search"
        : initialBrowseAll ? "all" : "landing";

  useEffect(() => {
    if (view !== "landing" || plans !== null) return;
    let active = true;
    setPlansLoading(true);
    void supabase
      .from("membership_plans")
      .select("id, name, description, plan_type, event_date, active, price")
      .order("active", { ascending: false })
      .order("plan_type", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setPlansError(error.message);
        else setPlans((data as Plan[]) ?? []);
        setPlansLoading(false);
      });
    return () => { active = false; };
  }, [view, plans, supabase]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (value.length >= 2) onOpenSearch(value);
  };

  if (view !== "landing") {
    const selectedPlan = plans?.find((plan) => plan.id === initialPlanId);
    const title = view === "members"
      ? "Active members"
      : view === "plan"
        ? selectedPlan?.name ?? "Plan members"
        : view === "all" ? "All customers" : "Customer results";
    return (
      <section>
        <motion.button type="button" whileTap={tapScale} onClick={() => setAddCustomerOpen(true)} className="fixed right-5 z-50 inline-flex min-h-12 items-center gap-2 rounded-full border border-brand-sky/45 bg-brand-sky px-4 text-sm font-bold text-brand-ink shadow-lg shadow-black/20 transition-colors hover:brightness-105 md:hidden" style={{ bottom: "calc(env(safe-area-inset-bottom) + 94px)" }}>
          <Plus size={17} /> Add customer
        </motion.button>
        {addCustomerOpen && <AddCustomerModal onClose={() => setAddCustomerOpen(false)} onCreated={(phone) => {
          setAddCustomerOpen(false);
          onOpenSearch(phone);
        }} />}
        <div className="mb-4 flex items-center gap-3">
          <motion.button type="button" whileTap={tapScale} onClick={onBack}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-brand-nightSurface px-3 text-sm font-semibold text-brand-nightText/70 transition-colors hover:border-brand-sky/30 hover:text-brand-skyLight">
            <ArrowLeft size={15} /> Customers
          </motion.button>
          <h2 className="min-w-0 truncate text-base font-semibold text-brand-nightText">{title}</h2>
        </div>
        {view === "plan" && selectedPlan && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-brand-nightText/50">
            <span className={`rounded-full px-2.5 py-1 font-semibold ${selectedPlan.plan_type === "special" ? "bg-brand-sun/10 text-brand-sun" : "bg-brand-sky/10 text-brand-skyLight"}`}>
              {selectedPlan.plan_type === "special" ? "Special day" : "Membership plan"}
            </span>
            <span className={`rounded-full px-2.5 py-1 font-semibold ${selectedPlan.active ? "bg-brand-leaf/10 text-brand-leaf" : "bg-white/[0.06] text-brand-nightText/40"}`}>
              {selectedPlan.active ? "Active" : "Inactive"}
            </span>
          </div>
        )}
        <CustomerSearch
          key={`${view}:${initialQuery}:${initialPlanId ?? ""}:${initialNewOnly ? 1 : 0}:${initialExpiringOnly ? 1 : 0}:${initialExpiredOnly ? 1 : 0}`}
          isAdmin={isAdmin}
          initialQuery={initialQuery}
          initialPlanId={initialPlanId}
          focusCustomerPhone={initialQuery || undefined}
          focusChildId={initialChildId}
          filterNewThisMonth={initialNewOnly}
          membersOnly={view === "members"}
          browseAll={view === "all"}
          filterExpiringSoon={initialExpiringOnly}
          filterExpired={initialExpiredOnly}
          showFilters={false}
        />
      </section>
    );
  }

  const activePlans = plans?.filter((plan) => plan.active) ?? [];
  const inactivePlans = plans?.filter((plan) => !plan.active) ?? [];

  return (
    <div className="space-y-5">
      <form onSubmit={submitSearch} className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand-nightText/35" />
        <input value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a child, parent, or phone number"
          className="min-h-[52px] w-full rounded-2xl border border-white/10 bg-brand-nightSurface px-11 pr-24 text-base text-brand-nightText outline-none transition-colors placeholder:text-brand-nightText/35 focus:border-brand-sky/50" />
        <button type="submit" disabled={query.trim().length < 2}
          className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded-xl bg-brand-sky px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-sky/90 disabled:opacity-35">Search</button>
      </form>

      <motion.button type="button" whileTap={tapScale} onClick={() => setAddCustomerOpen(true)} className="hidden min-h-10 items-center gap-2 rounded-xl border border-brand-sky/35 bg-brand-sky/10 px-3.5 text-sm font-semibold text-brand-skyLight transition-colors hover:bg-brand-sky/15 md:inline-flex">
        <Plus size={16} /> Add customer
      </motion.button>

      <motion.button type="button" whileTap={tapScale} onClick={() => setAddCustomerOpen(true)} className="fixed right-5 z-50 inline-flex min-h-12 items-center gap-2 rounded-full border border-brand-sky/45 bg-brand-sky px-4 text-sm font-bold text-brand-ink shadow-lg shadow-black/20 transition-colors hover:brightness-105 md:hidden" style={{ bottom: "calc(env(safe-area-inset-bottom) + 94px)" }}>
        <Plus size={17} /> Add customer
      </motion.button>

      {addCustomerOpen && <AddCustomerModal onClose={() => setAddCustomerOpen(false)} onCreated={(phone) => {
        setAddCustomerOpen(false);
        onOpenSearch(phone);
      }} />}

      <div className="grid grid-cols-2 gap-2.5">
        <motion.button type="button" whileTap={tapScale} onClick={onOpenAll}
          className="flex min-h-12 min-w-0 items-center justify-between gap-1.5 rounded-2xl border border-brand-leaf/45 bg-brand-leaf/20 px-3 text-left transition-colors hover:border-brand-leaf/60 hover:bg-brand-leaf/25">
          <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-brand-nightText sm:text-sm"><Search size={15} className="shrink-0 text-brand-leaf" /><span>Browse all customers</span></span>
          <ArrowLeft size={14} className="shrink-0 rotate-180 text-brand-leaf" />
        </motion.button>

        <motion.button type="button" whileTap={tapScale} onClick={onOpenMembers}
          className="flex min-h-12 min-w-0 items-center justify-between gap-1.5 rounded-2xl border border-brand-sky/45 bg-brand-sky/20 px-3 text-left transition-colors hover:border-brand-sky/60 hover:bg-brand-sky/25">
          <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-brand-nightText sm:text-sm"><BadgeCheck size={16} className="shrink-0 text-brand-skyLight" /><span>Show active customers</span></span>
          <ArrowLeft size={14} className="shrink-0 rotate-180 text-brand-skyLight" />
        </motion.button>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={15} className="text-brand-skyLight" />
          <h2 className="text-sm font-semibold text-brand-nightText">Plans</h2>
        </div>
        {plansLoading && <p className="py-5 text-center text-sm text-brand-nightText/40">Loading plans…</p>}
        {plansError && <p role="alert" className="rounded-xl border border-brand-coral/20 bg-brand-coral/10 px-3 py-2 text-sm text-brand-coral">Could not load plans: {plansError}</p>}
        {!plansLoading && !plansError && plans?.length === 0 && <p className="rounded-xl border border-white/10 bg-brand-nightSurface px-4 py-5 text-sm text-brand-nightText/40">No plans are set up yet.</p>}
        {!!activePlans.length && <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {activePlans.map((plan) => <PlanCard key={plan.id} plan={plan} planIds={plans?.map((candidate) => candidate.id) ?? []} onClick={() => onOpenPlan(plan.id)} />)}
        </div>}
        {!!inactivePlans.length && <>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-nightText/35">Inactive plans</h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {inactivePlans.map((plan) => <PlanCard key={plan.id} plan={plan} planIds={plans?.map((candidate) => candidate.id) ?? []} onClick={() => onOpenPlan(plan.id)} />)}
          </div>
        </>}
      </section>
    </div>
  );
}

function PlanCard({ plan, onClick, planIds }: { plan: Plan; onClick: () => void; planIds: string[] }) {
  const special = plan.plan_type === "special";
  const tone = planCardTone(plan.id, planIds);
  return (
    <motion.button type="button" whileTap={tapScale} onClick={onClick}
      className={`group min-h-[90px] rounded-2xl border border-l-4 p-3.5 text-left transition-colors ${tone.stripe} ${tone.card} ${plan.active ? "hover:brightness-[1.03]" : "opacity-65 hover:opacity-90"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-brand-nightText">{plan.name}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tone.badge}`}>
          {special ? <><CalendarDays size={10} className="mr-1 inline" />Special day</> : "Membership"}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-brand-nightText/40">{plan.event_date ? new Date(`${plan.event_date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : plan.description || "Tap to view customers"}</span>
        <span className={`shrink-0 text-xs font-semibold ${plan.active ? "text-brand-leaf" : "text-brand-nightText/40"}`}>{plan.active ? "Active" : "Inactive"}</span>
      </div>
    </motion.button>
  );
}
