"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BadgePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomSheet from "@/components/ui/BottomSheet";
import { tapScale } from "@/lib/motion";

type Plan = { id: string; name: string; price: number };

// Replaces the "assign a plan" action that used to live in the
// Memberships → Subscribers screen (that screen only did browsing now
// that it's gone — see decisions-and-learnings). Lives on the child's
// own row in Directory instead: you're already looking at the kid,
// adding their membership here is one tap rather than a separate hunt
// through a membership-management screen.
export default function AddMembershipButton({
  childId,
  childName,
  onApplied,
}: {
  childId: string;
  childName: string;
  onApplied?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || plans) return;
    const supabase = createClient();
    supabase
      .from("membership_plans")
      .select("id, name, price")
      .eq("plan_type", "recurring")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setPlans((data as Plan[]) ?? []));
  }, [open, plans]);

  const apply = async (planId: string) => {
    setApplying(planId);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("admin_apply_plan_to_child", {
      p_child_id: childId,
      p_plan_id: planId,
    });
    setApplying(null);
    if (err) {
      setError(err.message);
      return;
    }
    setOpen(false);
    onApplied?.();
  };

  return (
    <>
      <motion.button
        type="button"
        whileTap={tapScale}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Add membership for ${childName}`}
        className="flex min-h-10 w-fit items-center gap-2 rounded-xl border border-brand-sky/25 bg-brand-sky/10 px-3.5 text-xs font-semibold text-brand-skyLight transition-colors hover:border-brand-sky/40 hover:bg-brand-sky/15"
      >
        <BadgePlus size={14} />
        Add membership
      </motion.button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Add a plan for ${childName}`}
      >
        {plans === null ? (
          <p className="text-sm text-brand-nightText/40 py-4">Loading plans…</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-brand-nightText/40 py-4">
            No active plans to assign — create one in Plans first.
          </p>
        ) : (
          <div className="space-y-2">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => apply(p.id)}
                disabled={applying !== null}
                className="w-full flex items-center justify-between gap-3 min-h-[48px] px-4 rounded-xl2 border border-white/10 bg-brand-nightSurface2 text-left hover:border-brand-sky/40 transition-colors disabled:opacity-50"
              >
                <span className="text-sm font-semibold text-brand-nightText">
                  {p.name}
                </span>
                <span className="text-xs text-brand-nightText/45 shrink-0">
                  {applying === p.id ? "Applying…" : `₹${p.price}`}
                </span>
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-brand-coral mt-3">{error}</p>}
        <p className="text-[11px] text-brand-nightText/35 mt-3">
          Starts today. This replaces any existing membership on this child.
        </p>
      </BottomSheet>
    </>
  );
}
