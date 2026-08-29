"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";
import { Check, Clock, Calendar, IndianRupee, ArrowLeft } from "lucide-react";

type Child = {
  id: string;
  name: string;
  age: number;
  current_plan_name: string | null;
  current_plan_expires_on: string | null;
  current_plan_active: boolean;
};

type Plan = {
  id: string;
  name: string;
  description: string | null;
  plan_type: "recurring" | "special";
  event_date: string | null;
  validity_value: number;
  validity_unit: "weeks" | "months";
  hours_per_visit: number;
  price: number;
  min_age: number | null;
  max_age: number | null;
};

function formatEventDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function inputClass() {
  return "w-full min-h-[56px] rounded-xl2 border-2 border-brand-sky/20 focus:border-brand-sky focus:outline-none px-4 text-brand-ink text-lg text-center tracking-widest";
}

type Step = "phone" | "notFound" | "children" | "plan" | "done";

export default function RenewalFlow() {
  const supabase = createClient();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [parentName, setParentName] = useState("");
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  const handleLookup = async () => {
    setError(null);
    const digits = phone.replace(/\D/g, "");
    if (!/^\d{10}$/.test(digits)) {
      setError("Enter the 10-digit number used at registration.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await supabase.rpc("renewal_lookup", {
        p_phone: digits,
        p_client_key: getClientKey(),
      });
      if (err) throw err;
      if (!data.found) {
        setStep("notFound");
        return;
      }
      setCustomerId(data.customer_id);
      setParentName(data.parent_name);
      setChildren(data.children ?? []);
      setStep("children");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step !== "plan" || plansLoaded) return;
    (async () => {
      const { data } = await supabase
        .from("membership_plans")
        .select("*")
        .eq("active", true)
        .eq("plan_type", "recurring")
        .order("price", { ascending: true });
      setPlans((data as Plan[]) ?? []);
      setPlansLoaded(true);
    })();
  }, [step, plansLoaded, supabase]);

  const eligiblePlans = useMemo(() => {
    if (!selectedChild) return plans;
    return plans.filter(
      (p) =>
        (p.min_age == null || selectedChild.age >= p.min_age) &&
        (p.max_age == null || selectedChild.age <= p.max_age),
    );
  }, [plans, selectedChild]);

  const handleSubmit = async () => {
    if (!selectedChild || !selectedPlanId) return;
    setError(null);
    setSubmitting(true);
    try {
      const digits = phone.replace(/\D/g, "");
      const { data, error: err } = await supabase.rpc(
        "submit_membership_renewal",
        {
          p_phone: digits,
          p_child_id: selectedChild.id,
          p_plan_id: selectedPlanId,
          p_client_key: getClientKey(),
        },
      );
      if (err) throw err;
      setReceipt(data.receipt_number);
      setStep("done");
    } catch (e: any) {
      setError(e.message ?? "Couldn't submit the renewal. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-cloud flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <img
          src="/logo-full.png"
          alt="QureoCity"
          className="h-14 mx-auto mb-6"
        />

        {error && (
          <div className="mb-4 rounded-xl2 bg-brand-coral/10 border border-brand-coral text-brand-coral px-4 py-3 text-sm font-medium animate-popIn">
            {error}
          </div>
        )}

        <div
          key={step}
          className="bg-white rounded-xl2 shadow-sm p-6 animate-popIn"
        >
          {step === "phone" && (
            <>
              <h1 className="text-xl font-bold text-brand-ink mb-1">
                Renew your membership
              </h1>
              <p className="text-sm text-brand-ink/50 mb-5">
                Enter the mobile number you registered with — we'll pull up your
                child so you don't have to fill everything again.
              </p>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                placeholder="10-digit number"
                className={inputClass()}
                autoFocus
              />
              <button
                onClick={handleLookup}
                disabled={loading}
                className="w-full min-h-[56px] mt-5 rounded-xl2 bg-brand-sky text-white font-bold text-lg disabled:opacity-50"
              >
                {loading ? "Looking up…" : "Continue"}
              </button>
            </>
          )}

          {step === "notFound" && (
            <>
              <h1 className="text-xl font-bold text-brand-ink mb-1">
                We couldn't find that number
              </h1>
              <p className="text-sm text-brand-ink/50 mb-5">
                If this is your first time here, register as a new member
                instead — it only takes a couple of minutes.
              </p>
              <a
                href="/checkin/register"
                className="w-full min-h-[56px] rounded-xl2 bg-brand-sky text-white font-bold text-lg flex items-center justify-center"
              >
                Register as a member
              </a>
              <button
                onClick={() => {
                  setStep("phone");
                  setError(null);
                }}
                className="w-full mt-3 text-center text-sm font-semibold text-brand-ink/40"
              >
                ← Try a different number
              </button>
            </>
          )}

          {step === "children" && (
            <>
              <h1 className="text-xl font-bold text-brand-ink mb-1">
                Welcome back, {parentName.split(" ")[0]}!
              </h1>
              <p className="text-sm text-brand-ink/50 mb-5">
                Who are we renewing for?
              </p>
              <div className="space-y-3">
                {children.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedChild(c);
                      setStep("plan");
                    }}
                    className="w-full text-left rounded-xl2 border-2 border-brand-ink/10 hover:border-brand-sky/40 bg-white p-4 transition-colors"
                  >
                    <p className="font-bold text-brand-ink">
                      {c.name}{" "}
                      <span className="font-normal text-brand-ink/40">
                        · {c.age} yrs
                      </span>
                    </p>
                    <p className="text-xs text-brand-ink/50 mt-1">
                      {c.current_plan_active
                        ? `Current: ${c.current_plan_name ?? "Active plan"}${
                            c.current_plan_expires_on
                              ? ` · expires ${formatEventDate(c.current_plan_expires_on)}`
                              : ""
                          }`
                        : c.current_plan_expires_on
                          ? `Expired ${formatEventDate(c.current_plan_expires_on)}`
                          : "No plan on file yet"}
                    </p>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep("phone")}
                className="w-full mt-5 text-center text-sm font-semibold text-brand-ink/40 flex items-center justify-center gap-1"
              >
                <ArrowLeft size={14} /> Back
              </button>
            </>
          )}

          {step === "plan" && selectedChild && (
            <>
              <h1 className="text-xl font-bold text-brand-ink mb-1">
                Pick a plan for {selectedChild.name}
              </h1>
              <p className="text-sm text-brand-ink/50 mb-5">
                Age {selectedChild.age} · showing plans that fit
              </p>

              {!plansLoaded ? (
                <p className="text-sm text-brand-ink/40 py-4">Loading plans…</p>
              ) : eligiblePlans.length === 0 ? (
                <p className="text-sm text-brand-ink/50 py-4">
                  No plans currently match this age — please ask our staff.
                </p>
              ) : (
                <div className="space-y-3">
                  {eligiblePlans.map((p) => {
                    const isSelected = selectedPlanId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setSelectedPlanId(isSelected ? "" : p.id)
                        }
                        className={`w-full text-left rounded-xl2 border-2 p-4 transition-colors ${
                          isSelected
                            ? "border-brand-sky bg-brand-sky/5"
                            : "border-brand-ink/10 bg-white hover:border-brand-sky/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-brand-ink">
                                {p.name}
                              </p>
                              {p.plan_type === "special" && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-coral bg-brand-coral/10 rounded-full px-2 py-0.5 shrink-0">
                                  {p.event_date
                                    ? formatEventDate(p.event_date)
                                    : "Special day"}
                                </span>
                              )}
                            </div>
                            {p.description && (
                              <p className="text-xs text-brand-ink/50 mt-0.5">
                                {p.description}
                              </p>
                            )}
                          </div>
                          <div
                            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-extrabold flex items-center gap-0.5 ${
                              isSelected
                                ? "bg-brand-sky text-white"
                                : "bg-brand-sun/15 text-brand-purpleDeep"
                            }`}
                          >
                            <IndianRupee size={13} />
                            {p.price}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-brand-ink/55">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {p.hours_per_visit} hrs/visit
                          </span>
                          {p.plan_type === "special" ? (
                            p.event_date && (
                              <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                One day only
                              </span>
                            )
                          ) : (
                            <span className="flex items-center gap-1">
                              <Calendar size={12} />
                              {p.validity_value} {p.validity_unit} validity
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-1.5 mt-3 text-xs font-semibold text-brand-sky">
                            <Check size={14} /> Selected
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!selectedPlanId || submitting}
                className="w-full min-h-[56px] mt-5 rounded-xl2 bg-brand-sky text-white font-bold text-lg disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit renewal"}
              </button>
              <button
                onClick={() => setStep("children")}
                className="w-full mt-3 text-center text-sm font-semibold text-brand-ink/40 flex items-center justify-center gap-1"
              >
                <ArrowLeft size={14} /> Back
              </button>
            </>
          )}

          {step === "done" && receipt && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-brand-leaf/15 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎉</span>
              </div>
              <h1 className="text-xl font-bold text-brand-ink mb-1">
                Renewal submitted!
              </h1>
              <p className="text-brand-ink/60 mb-4">
                Our team will confirm it shortly.
              </p>
              <div className="bg-brand-cloud rounded-xl2 py-4 mb-2">
                <p className="text-xs text-brand-ink/40 mb-1">Receipt number</p>
                <p className="text-2xl font-extrabold text-brand-ink tracking-wide">
                  {receipt}
                </p>
              </div>
            </div>
          )}
        </div>

        <a
          href="/checkin"
          className="mt-4 block text-center text-sm font-semibold text-brand-ink/40"
        >
          ← Back to check-in
        </a>
      </div>
    </div>
  );
}
