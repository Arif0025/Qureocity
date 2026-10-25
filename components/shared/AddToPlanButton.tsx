"use client";

import { useState } from "react";
import { BadgePlus, CalendarDays, Check, ChevronLeft, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomSheet from "@/components/ui/BottomSheet";
import { todayISTDateString } from "@/lib/istTime";

type PlanKind = "recurring" | "special";
type Plan = { id: string; name: string; description: string | null; price: number; event_date: string | null };

export default function AddToPlanButton({
  childId,
  childName,
  registeredSpecialPlanIds,
  onApplied,
}: {
  childId: string;
  childName: string;
  registeredSpecialPlanIds: string[];
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PlanKind | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdPassId, setCreatedPassId] = useState<string | null>(null);

  const chooseKind = async (nextKind: PlanKind) => {
    setKind(nextKind);
    setPlans(null);
    setError(null);
    setCreatedPassId(null);
    setLoadingPlans(true);
    let request = createClient()
      .from("membership_plans")
      .select("id, name, description, price, event_date")
      .eq("plan_type", nextKind)
      .eq("active", true)
      .order("name", { ascending: true });
    if (nextKind === "special") {
      request = request.gte("event_date", todayISTDateString()).order("event_date", { ascending: true });
    }
    const { data, error: queryError } = await request;
    setLoadingPlans(false);
    if (queryError) setError(queryError.message);
    else setPlans((data as Plan[]) ?? []);
  };

  const assign = async (plan: Plan) => {
    setApplying(plan.id);
    setError(null);
    const supabase = createClient();
    if (kind === "recurring") {
      const { error: assignError } = await supabase.rpc("admin_apply_plan_to_child", {
        p_child_id: childId,
        p_plan_id: plan.id,
      });
      setApplying(null);
      if (assignError) return setError(assignError.message);
      setOpen(false);
      onApplied();
      return;
    }

    const { data, error: assignError } = await supabase.rpc("admin_add_child_special_pass", {
      p_child_id: childId,
      p_plan_id: plan.id,
    });
    setApplying(null);
    if (assignError) return setError(assignError.message);
    setCreatedPassId((data as { pass_id?: string } | null)?.pass_id ?? null);
    onApplied();
  };

  return (
    <>
      <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(true); setKind(null); setPlans(null); setError(null); setCreatedPassId(null); }}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand-sky/30 bg-brand-sky/10 px-3.5 text-xs font-semibold text-brand-skyLight transition-colors hover:bg-brand-sky/15">
        <BadgePlus size={14} /> Add to plan
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={`Add a plan for ${childName}`}>
        {!kind ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void chooseKind("recurring")} className="flex min-h-14 items-center justify-between rounded-xl border border-brand-sky/25 bg-brand-sky/[0.07] px-4 text-left text-sm font-semibold text-brand-nightText hover:bg-brand-sky/10">
              Membership <span className="text-xs text-brand-skyLight">Choose →</span>
            </button>
            <button type="button" onClick={() => void chooseKind("special")} className="flex min-h-14 items-center justify-between rounded-xl border border-brand-sun/25 bg-brand-sun/[0.07] px-4 text-left text-sm font-semibold text-brand-nightText hover:bg-brand-sun/10">
              Special day <span className="text-xs text-brand-sun">Choose →</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button type="button" onClick={() => { setKind(null); setPlans(null); setCreatedPassId(null); setError(null); }} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-brand-nightText/55 hover:text-brand-nightText">
              <ChevronLeft size={14} /> Change type · {kind === "recurring" ? "Membership" : "Special day"}
            </button>
            {loadingPlans && <p className="py-3 text-sm text-brand-nightText/45">Loading plans…</p>}
            {!loadingPlans && plans?.length === 0 && <p className="py-3 text-sm text-brand-nightText/45">No {kind === "recurring" ? "active memberships" : "upcoming active special days"} available.</p>}
            {plans?.map((plan) => {
              const alreadyRegistered = kind === "special" && registeredSpecialPlanIds.includes(plan.id);
              return (
                <button key={plan.id} type="button" onClick={() => void assign(plan)} disabled={applying !== null || alreadyRegistered}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-brand-nightSurface2 px-4 py-2.5 text-left transition-colors hover:border-brand-sky/30 disabled:opacity-55">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-brand-nightText">{plan.name}</span>
                    <span className="block text-xs text-brand-nightText/45">{kind === "special" && plan.event_date ? <><CalendarDays size={12} className="mr-1 inline" />{new Date(`${plan.event_date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · </> : null}₹{plan.price}{plan.description ? ` · ${plan.description}` : ""}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-brand-skyLight">
                    {alreadyRegistered ? <span className="inline-flex items-center gap-1 text-brand-leaf"><Check size={12} /> Registered</span> : applying === plan.id ? "Adding…" : kind === "recurring" ? "Assign" : <span className="inline-flex items-center gap-1 text-brand-sun"><Ticket size={12} /> Add pass</span>}
                  </span>
                </button>
              );
            })}
            {createdPassId && <p className="break-all rounded-lg bg-brand-leaf/10 px-3 py-2.5 text-xs font-medium text-brand-leaf">Special-day pass created · ID {createdPassId}</p>}
            {error && <p role="alert" className="text-sm text-brand-coral">{error}</p>}
            {kind === "recurring" && <p className="text-[11px] text-brand-nightText/35">Assigning a membership replaces this child’s current membership.</p>}
            {createdPassId && <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-lg bg-brand-sky px-4 text-xs font-semibold text-white">Done</button>}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
