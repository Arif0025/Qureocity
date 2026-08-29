"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";
import {
  Check,
  Clock,
  IndianRupee,
  ArrowLeft,
  Calendar,
  PartyPopper,
} from "lucide-react";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  code: string;
  event_date: string;
  hours_per_visit: number;
  price: number;
  min_age: number | null;
  max_age: number | null;
  active: boolean;
};

type Child = {
  id: string;
  name: string;
  age: number;
  already_registered_for_plan?: boolean;
};

function formatEventDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function inputClass() {
  return "w-full min-h-[52px] rounded-xl2 border-2 border-brand-sky/20 focus:border-brand-sky focus:outline-none px-4 text-brand-ink text-base";
}

type Step =
  | "loading"
  | "notFound"
  | "ended"
  | "phone"
  | "existing"
  | "addChild"
  | "newFamily"
  | "done";

export default function SpecialDayCheckin({ code }: { code: string }) {
  const supabase = createClient();
  const [step, setStep] = useState<Step>("loading");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [phone, setPhone] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [parentName, setParentName] = useState("");
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [newChildName, setNewChildName] = useState("");
  const [newChildDob, setNewChildDob] = useState("");
  const [newParentName, setNewParentName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // "Add a child not listed" — for an existing family, adding a kid who
  // isn't in our records yet, without leaving the phone-matched flow.
  const [addChildName, setAddChildName] = useState("");
  const [addChildDob, setAddChildDob] = useState("");

  const [receipts, setReceipts] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from("membership_plans")
        .select("*")
        .eq("code", code.toUpperCase())
        .eq("plan_type", "special")
        .maybeSingle();
      if (err || !data) {
        setStep("notFound");
        return;
      }
      const p = data as Plan;
      const today = new Date().toISOString().slice(0, 10);
      if (!p.active || p.event_date < today) {
        setPlan(p);
        setStep("ended");
        return;
      }
      setPlan(p);
      setStep("phone");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleLookup = async () => {
    setError(null);
    const digits = phone.replace(/\D/g, "");
    if (!/^\d{10}$/.test(digits)) {
      setError("Enter a 10-digit mobile number.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await supabase.rpc("renewal_lookup", {
        p_phone: digits,
        p_client_key: getClientKey(),
        p_plan_id: plan?.id,
      });
      if (err) throw err;
      if (!data.found) {
        setNewPhone(digits);
        setStep("newFamily");
        return;
      }
      setCustomerId(data.customer_id);
      setParentName(data.parent_name);
      setChildren(
        (data.children ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          age: c.age,
          already_registered_for_plan: c.already_registered_for_plan ?? false,
        })),
      );
      setSelectedIds(new Set());
      setStep("existing");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleChild = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitExisting = async () => {
    if (!plan || selectedIds.size === 0) return;
    setError(null);
    setLoading(true);
    const digits = phone.replace(/\D/g, "");
    const collected: string[] = [];
    try {
      for (const childId of selectedIds) {
        const { data, error: err } = await supabase.rpc(
          "submit_membership_renewal",
          {
            p_phone: digits,
            p_child_id: childId,
            p_plan_id: plan.id,
            p_client_key: getClientKey(),
          },
        );
        if (err) throw err;
        collected.push(data.receipt_number);
      }
      setReceipts(collected);
      setStep("done");
    } catch (e: any) {
      setError(
        e.message ?? "Couldn't complete registration. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const submitAddChild = async () => {
    if (!plan) return;
    setError(null);
    if (!addChildName.trim() || !addChildDob) {
      setError("Enter the child's name and date of birth.");
      return;
    }
    setLoading(true);
    try {
      const digits = phone.replace(/\D/g, "");
      const { data, error: err } = await supabase.rpc(
        "submit_membership_registration",
        {
          p_child_name: addChildName.trim(),
          p_date_of_birth: addChildDob,
          p_gender: null,
          p_school: null,
          p_interests: [],
          p_allergies: null,
          p_medical_conditions: null,
          p_special_instructions: null,
          p_parent_name: parentName,
          p_phone: digits,
          p_secondary_phone: null,
          p_address: null,
          p_plan_id: plan.id,
          p_how_heard: `Special day link — ${plan.code}`,
          p_photo_consent: false,
          p_whatsapp_consent: false,
          p_client_key: getClientKey(),
        },
      );
      if (err) throw err;
      setReceipts([data.receipt_number]);
      setStep("done");
    } catch (e: any) {
      setError(e.message ?? "Couldn't submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitNewFamily = async () => {
    if (!plan) return;
    setError(null);
    if (
      !newChildName.trim() ||
      !newChildDob ||
      !newParentName.trim() ||
      !newPhone
    ) {
      setError(
        "Please fill in the child's name, date of birth, and your name.",
      );
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await supabase.rpc(
        "submit_membership_registration",
        {
          p_child_name: newChildName.trim(),
          p_date_of_birth: newChildDob,
          p_gender: null,
          p_school: null,
          p_interests: [],
          p_allergies: null,
          p_medical_conditions: null,
          p_special_instructions: null,
          p_parent_name: newParentName.trim(),
          p_phone: newPhone,
          p_secondary_phone: null,
          p_address: null,
          p_plan_id: plan.id,
          p_how_heard: `Special day link — ${plan.code}`,
          p_photo_consent: false,
          p_whatsapp_consent: false,
          p_client_key: getClientKey(),
        },
      );
      if (err) throw err;
      setReceipts([data.receipt_number]);
      setStep("done");
    } catch (e: any) {
      setError(e.message ?? "Couldn't submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen bg-brand-cloud flex items-center justify-center">
        <p className="text-brand-ink/40 text-sm">Loading…</p>
      </div>
    );
  }

  if (step === "notFound") {
    return (
      <div className="min-h-screen bg-brand-cloud flex flex-col items-center justify-center px-4">
        <img src="/logo-full.png" alt="QureoCity" className="h-14 mb-6" />
        <div className="bg-white rounded-xl2 shadow-sm p-6 max-w-md text-center">
          <h1 className="text-xl font-bold text-brand-ink mb-1">
            We couldn't find that event
          </h1>
          <p className="text-sm text-brand-ink/50 mb-5">
            This link doesn't match a special day we currently have set up.
          </p>
          <a
            href="/checkin/special"
            className="w-full min-h-[52px] rounded-xl2 bg-brand-sky text-white font-bold flex items-center justify-center"
          >
            See all special days
          </a>
        </div>
      </div>
    );
  }

  if (step === "ended" && plan) {
    return (
      <div className="min-h-screen bg-brand-cloud flex flex-col items-center justify-center px-4">
        <img src="/logo-full.png" alt="QureoCity" className="h-14 mb-6" />
        <div className="bg-white rounded-xl2 shadow-sm p-6 max-w-md text-center">
          <h1 className="text-xl font-bold text-brand-ink mb-1">
            {plan.name} has ended
          </h1>
          <p className="text-sm text-brand-ink/50 mb-5">
            This event's date has already passed, or it's no longer open for
            sign-ups. Check out what's coming up next.
          </p>
          <a
            href="/checkin/special"
            className="w-full min-h-[52px] rounded-xl2 bg-brand-sky text-white font-bold flex items-center justify-center"
          >
            See all special days
          </a>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className="min-h-screen bg-brand-cloud flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <img
          src="/logo-full.png"
          alt="QureoCity"
          className="h-14 mx-auto mb-6"
        />

        <div className="bg-white rounded-xl2 shadow-sm p-5 mb-4 animate-popIn">
          <div className="flex items-center gap-2 mb-1">
            <PartyPopper size={18} className="text-brand-coral" />
            <p className="font-extrabold text-lg text-brand-ink">{plan.name}</p>
          </div>
          {plan.description && (
            <p className="text-sm text-brand-ink/55 mb-2">{plan.description}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-ink/55">
            <span className="flex items-center gap-1">
              <Calendar size={12} /> {formatEventDate(plan.event_date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} /> {plan.hours_per_visit} hrs
            </span>
            <span className="flex items-center gap-1 font-semibold text-brand-purpleDeep">
              <IndianRupee size={12} /> {plan.price}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl2 bg-brand-coral/10 border border-brand-coral text-brand-coral px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        <div
          key={step}
          className="bg-white rounded-xl2 shadow-sm p-6 animate-popIn"
        >
          {step === "phone" && (
            <>
              <h2 className="text-lg font-bold text-brand-ink mb-1">
                Register for this day
              </h2>
              <p className="text-sm text-brand-ink/50 mb-5">
                Already a member? Enter your mobile number and we'll pull up
                your kids.
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
                placeholder="10-digit mobile number"
                className={inputClass()}
                autoFocus
              />
              <button
                onClick={handleLookup}
                disabled={loading}
                className="w-full min-h-[52px] mt-4 rounded-xl2 bg-brand-sky text-white font-bold disabled:opacity-50"
              >
                {loading ? "Checking…" : "Continue"}
              </button>
            </>
          )}

          {step === "existing" && (
            <>
              <h2 className="text-lg font-bold text-brand-ink mb-1">
                Welcome back, {parentName.split(" ")[0]}!
              </h2>
              <p className="text-sm text-brand-ink/50 mb-4">
                Who's coming to {plan.name}?
              </p>
              <div className="space-y-2 mb-4">
                {children.map((c) => {
                  const eligible =
                    (plan.min_age == null || c.age >= plan.min_age) &&
                    (plan.max_age == null || c.age <= plan.max_age);
                  const alreadyIn = c.already_registered_for_plan;
                  const disabled = !eligible || alreadyIn;
                  const checked = selectedIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleChild(c.id)}
                      className={`w-full text-left rounded-xl2 border-2 p-3.5 flex items-center justify-between transition-colors disabled:opacity-40 ${
                        checked
                          ? "border-brand-sky bg-brand-sky/5"
                          : "border-brand-ink/10 bg-white"
                      }`}
                    >
                      <span className="font-semibold text-brand-ink">
                        {c.name}{" "}
                        <span className="font-normal text-brand-ink/40">
                          · {c.age}y
                        </span>
                        {alreadyIn && (
                          <span className="block text-[11px] font-normal text-brand-leaf">
                            Already registered for this day
                          </span>
                        )}
                        {!alreadyIn && !eligible && (
                          <span className="block text-[11px] font-normal text-brand-ink/35">
                            Outside this event's age range
                          </span>
                        )}
                      </span>
                      <span
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          checked
                            ? "bg-brand-sky border-brand-sky text-white"
                            : "border-brand-ink/20"
                        }`}
                      >
                        {checked && <Check size={14} />}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setStep("addChild")}
                  className="w-full text-left rounded-xl2 border-2 border-dashed border-brand-ink/15 hover:border-brand-sky/40 p-3.5 text-sm font-semibold text-brand-ink/50 hover:text-brand-sky transition-colors"
                >
                  + My child isn't listed here
                </button>
              </div>
              <button
                onClick={submitExisting}
                disabled={selectedIds.size === 0 || loading}
                className="w-full min-h-[52px] rounded-xl2 bg-brand-sky text-white font-bold disabled:opacity-50"
              >
                {loading
                  ? "Registering…"
                  : `Register ${selectedIds.size || ""} kid${selectedIds.size === 1 ? "" : "s"}`.trim()}
              </button>
              <button
                onClick={() => setStep("phone")}
                className="w-full mt-3 text-center text-sm font-semibold text-brand-ink/40 flex items-center justify-center gap-1"
              >
                <ArrowLeft size={14} /> Back
              </button>
            </>
          )}

          {step === "addChild" && (
            <>
              <h2 className="text-lg font-bold text-brand-ink mb-1">
                Add a child
              </h2>
              <p className="text-sm text-brand-ink/50 mb-4">
                We'll add them to your family's record and register them for{" "}
                {plan.name}.
              </p>
              <div className="space-y-3">
                <input
                  value={addChildName}
                  onChange={(e) => setAddChildName(e.target.value)}
                  placeholder="Child's name"
                  className={inputClass()}
                  autoFocus
                />
                <div>
                  <label className="text-xs text-brand-ink/45 block mb-1">
                    Date of birth
                  </label>
                  <input
                    type="date"
                    value={addChildDob}
                    onChange={(e) => setAddChildDob(e.target.value)}
                    className={inputClass()}
                  />
                </div>
              </div>
              <button
                onClick={submitAddChild}
                disabled={loading}
                className="w-full min-h-[52px] mt-5 rounded-xl2 bg-brand-sky text-white font-bold disabled:opacity-50"
              >
                {loading ? "Submitting…" : "Register this child"}
              </button>
              <button
                onClick={() => setStep("existing")}
                className="w-full mt-3 text-center text-sm font-semibold text-brand-ink/40 flex items-center justify-center gap-1"
              >
                <ArrowLeft size={14} /> Back
              </button>
            </>
          )}

          {step === "newFamily" && (
            <>
              <h2 className="text-lg font-bold text-brand-ink mb-1">
                First time here — welcome!
              </h2>
              <p className="text-sm text-brand-ink/50 mb-4">
                Just the basics to get your child registered for this day.
              </p>
              <div className="space-y-3">
                <input
                  value={newChildName}
                  onChange={(e) => setNewChildName(e.target.value)}
                  placeholder="Child's name"
                  className={inputClass()}
                />
                <div>
                  <label className="text-xs text-brand-ink/45 block mb-1">
                    Child's date of birth
                  </label>
                  <input
                    type="date"
                    value={newChildDob}
                    onChange={(e) => setNewChildDob(e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <input
                  value={newParentName}
                  onChange={(e) => setNewParentName(e.target.value)}
                  placeholder="Parent/guardian name"
                  className={inputClass()}
                />
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={newPhone}
                  onChange={(e) =>
                    setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="10-digit mobile number"
                  className={inputClass()}
                />
              </div>
              <button
                onClick={submitNewFamily}
                disabled={loading}
                className="w-full min-h-[52px] mt-5 rounded-xl2 bg-brand-sky text-white font-bold disabled:opacity-50"
              >
                {loading ? "Submitting…" : "Register for this day"}
              </button>
              <button
                onClick={() => setStep("phone")}
                className="w-full mt-3 text-center text-sm font-semibold text-brand-ink/40 flex items-center justify-center gap-1"
              >
                <ArrowLeft size={14} /> Back
              </button>
            </>
          )}

          {step === "done" && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-brand-leaf/15 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎉</span>
              </div>
              <h2 className="text-lg font-bold text-brand-ink mb-1">
                You're in!
              </h2>
              <p className="text-brand-ink/60 mb-4">
                Our team will confirm shortly. See you at {plan.name}!
              </p>
              <div className="bg-brand-cloud rounded-xl2 py-4 space-y-1">
                <p className="text-xs text-brand-ink/40">
                  Receipt number{receipts.length > 1 ? "s" : ""}
                </p>
                {receipts.map((r) => (
                  <p
                    key={r}
                    className="text-xl font-extrabold text-brand-ink tracking-wide"
                  >
                    {r}
                  </p>
                ))}
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
