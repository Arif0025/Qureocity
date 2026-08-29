"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";
import { Check, ChevronLeft, Clock, Calendar, IndianRupee } from "lucide-react";
import BirthDateDial from "./BirthDateDial";

const INTERESTS = [
  "Arts & Craft",
  "Books & Reading",
  "Role Play",
  "Sensory Play",
  "Building Blocks",
  "Music & Movement",
  "Science",
];

const HOW_HEARD_OPTIONS = [
  "Instagram",
  "WhatsApp",
  "Family/Friends",
  "Google Search",
  "Walk-in",
  "Other",
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Plan = {
  id: string;
  name: string;
  description: string | null;
  plan_type: "recurring" | "special";
  event_date: string | null;
  validity_value: number;
  validity_unit: "weeks" | "months";
  hours_per_visit: number;
  allowed_weekdays: number[];
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

type FormState = {
  child_name: string;
  date_of_birth: string;
  gender: string;
  school: string;
  interests: string[];
  allergies: string;
  medical_conditions: string;
  special_instructions: string;
  parent_name: string;
  phone: string;
  secondary_phone: string;
  address: string;
  plan_id: string;
  how_heard: string;
  photo_consent: boolean;
  whatsapp_consent: boolean;
};

const EMPTY: FormState = {
  child_name: "",
  date_of_birth: "",
  gender: "",
  school: "",
  interests: [],
  allergies: "",
  medical_conditions: "",
  special_instructions: "",
  parent_name: "",
  phone: "",
  secondary_phone: "",
  address: "",
  plan_id: "",
  how_heard: "",
  photo_consent: false,
  whatsapp_consent: false,
};

const STEPS = ["Child", "Medical", "Guardian", "Plan", "Finish"] as const;
type StepId = (typeof STEPS)[number];

function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function inputClass() {
  return "w-full min-h-[52px] rounded-xl2 border-2 border-brand-sky/20 focus:border-brand-sky focus:outline-none px-4 text-brand-ink";
}
function labelClass() {
  return "block text-sm font-semibold text-brand-ink/70 mb-1.5";
}

export default function RegistrationFlow() {
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const step: StepId = STEPS[stepIndex];
  const childAge = useMemo(
    () => ageFromDob(form.date_of_birth),
    [form.date_of_birth],
  );

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("membership_plans")
        .select("*")
        .eq("active", true)
        .eq("plan_type", "recurring")
        .order("price", { ascending: true });
      setPlans((data as Plan[]) ?? []);
    })();
  }, [supabase]);

  const eligiblePlans = useMemo(() => {
    if (childAge == null) return plans;
    return plans.filter(
      (p) =>
        (p.min_age == null || childAge >= p.min_age) &&
        (p.max_age == null || childAge <= p.max_age),
    );
  }, [plans, childAge]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleInterest = (interest: string) => {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(interest)
        ? f.interests.filter((i) => i !== interest)
        : [...f.interests, interest],
    }));
  };

  const selectedPlan = plans.find((p) => p.id === form.plan_id) ?? null;

  const validateStep = (): string | null => {
    if (step === "Child") {
      if (!form.child_name.trim()) return "Child's name is required.";
      if (!form.date_of_birth) return "Date of birth is required.";
    }
    if (step === "Guardian") {
      if (!form.parent_name.trim()) return "Parent/guardian name is required.";
      if (!/^\d{10}$/.test(form.phone.replace(/\D/g, "")))
        return "A valid 10-digit phone number is required.";
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep();
    if (err) return setError(err);
    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const goBack = () => {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const { data, error: err } = await supabase.rpc(
      "submit_membership_registration",
      {
        p_child_name: form.child_name.trim(),
        p_date_of_birth: form.date_of_birth,
        p_gender: form.gender || null,
        p_school: form.school || null,
        p_interests: form.interests,
        p_allergies: form.allergies || null,
        p_medical_conditions: form.medical_conditions || null,
        p_special_instructions: form.special_instructions || null,
        p_parent_name: form.parent_name.trim(),
        p_phone: form.phone.replace(/\D/g, ""),
        p_secondary_phone: form.secondary_phone || null,
        p_address: form.address || null,
        p_plan_id: form.plan_id || null,
        p_how_heard: form.how_heard || null,
        p_photo_consent: form.photo_consent,
        p_whatsapp_consent: form.whatsapp_consent,
        p_client_key: getClientKey(),
      },
    );
    setSubmitting(false);
    if (err) return setError(err.message);
    setReceipt((data as any).receipt_number);
  };

  if (receipt) {
    return (
      <div className="min-h-screen bg-brand-cloud flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-xl2 shadow-sm p-8 text-center animate-popIn">
          <img
            src="/logo-full.png"
            alt="QureoCity"
            className="h-14 mx-auto mb-6"
          />
          <div className="w-16 h-16 rounded-full bg-brand-leaf/15 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎉</span>
          </div>
          <h1 className="text-xl font-bold text-brand-ink mb-1">
            Thanks, {form.parent_name.split(" ")[0]}!
          </h1>
          <p className="text-brand-ink/60 mb-4">
            {form.child_name}'s registration is in — someone from our team will
            confirm it shortly.
          </p>
          <div className="bg-brand-cloud rounded-xl2 py-4 mb-2">
            <p className="text-xs text-brand-ink/40 mb-0.5">Receipt number</p>
            <p className="text-2xl font-extrabold text-brand-sky tracking-wide">
              {receipt}
            </p>
          </div>
          <p className="text-xs text-brand-ink/40">
            Please keep this number for reference.
          </p>
          <a
            href="/checkin"
            className="mt-6 block w-full min-h-[52px] leading-[52px] rounded-xl2 bg-brand-sky text-white font-semibold"
          >
            Done
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cloud px-4 py-8">
      <div className="w-full max-w-lg mx-auto">
        <img
          src="/logo-full.png"
          alt="QureoCity"
          className="h-14 mx-auto mb-6"
        />

        {/* Step progress */}
        <div className="flex items-center gap-1.5 mb-5 px-1">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i <= stepIndex ? "bg-brand-sky" : "bg-brand-sky/15"
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-xl2 shadow-sm p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-semibold text-brand-sky uppercase tracking-wide">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <h1 className="text-xl font-bold text-brand-ink">{step}</h1>
            </div>
            {stepIndex > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1 text-sm font-semibold text-brand-ink/40 hover:text-brand-ink"
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
          </div>

          {error && (
            <div className="mb-5 rounded-xl2 bg-brand-coral/10 border border-brand-coral text-brand-coral px-4 py-3 text-sm font-medium">
              {error}
            </div>
          )}

          <div key={step} className="animate-popIn space-y-5">
            {step === "Child" && (
              <>
                <div>
                  <label className={labelClass()}>Child's name</label>
                  <input
                    value={form.child_name}
                    onChange={(e) => set("child_name", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <BirthDateDial
                  value={form.date_of_birth}
                  onChange={(v) => set("date_of_birth", v)}
                  label="Date of birth"
                />
                <div>
                  <label className={labelClass()}>Gender</label>
                  <div className="flex gap-2">
                    {["Female", "Male", "Other"].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => set("gender", g)}
                        className={`flex-1 min-h-[44px] rounded-xl2 border-2 text-sm font-semibold transition-colors ${
                          form.gender === g
                            ? "bg-brand-sky text-white border-brand-sky"
                            : "bg-white text-brand-ink/60 border-brand-sky/20"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass()}>School (if any)</label>
                  <input
                    value={form.school}
                    onChange={(e) => set("school", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass()}>Interests</label>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((interest) => (
                      <button
                        key={interest}
                        type="button"
                        onClick={() => toggleInterest(interest)}
                        className={`text-sm font-medium px-3 py-2 rounded-full border-2 transition-colors ${
                          form.interests.includes(interest)
                            ? "bg-brand-sky text-white border-brand-sky"
                            : "bg-white text-brand-ink/60 border-brand-sky/20"
                        }`}
                      >
                        {interest}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === "Medical" && (
              <>
                <div>
                  <label className={labelClass()}>Allergies (if any)</label>
                  <input
                    value={form.allergies}
                    onChange={(e) => set("allergies", e.target.value)}
                    className={inputClass()}
                    placeholder="e.g. peanuts, dust"
                  />
                </div>
                <div>
                  <label className={labelClass()}>
                    Medical conditions (if any)
                  </label>
                  <input
                    value={form.medical_conditions}
                    onChange={(e) => set("medical_conditions", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass()}>Special instructions</label>
                  <textarea
                    value={form.special_instructions}
                    onChange={(e) =>
                      set("special_instructions", e.target.value)
                    }
                    rows={3}
                    className="w-full rounded-xl2 border-2 border-brand-sky/20 focus:border-brand-sky focus:outline-none px-4 py-3 text-brand-ink resize-none"
                  />
                </div>
              </>
            )}

            {step === "Guardian" && (
              <>
                <div>
                  <label className={labelClass()}>Name</label>
                  <input
                    value={form.parent_name}
                    onChange={(e) => set("parent_name", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass()}>Primary phone number</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.phone}
                    onChange={(e) =>
                      set(
                        "phone",
                        e.target.value.replace(/\D/g, "").slice(0, 10),
                      )
                    }
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass()}>
                    Secondary phone number (optional)
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.secondary_phone}
                    onChange={(e) =>
                      set(
                        "secondary_phone",
                        e.target.value.replace(/\D/g, "").slice(0, 10),
                      )
                    }
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass()}>Address</label>
                  <textarea
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    rows={2}
                    className="w-full rounded-xl2 border-2 border-brand-sky/20 focus:border-brand-sky focus:outline-none px-4 py-3 text-brand-ink resize-none"
                  />
                </div>
              </>
            )}

            {step === "Plan" && (
              <>
                {childAge != null && (
                  <p className="text-xs text-brand-ink/40 -mt-2">
                    Showing plans for age {childAge}
                  </p>
                )}
                {eligiblePlans.length === 0 ? (
                  <p className="text-sm text-brand-ink/50 py-4">
                    No plans currently match this age — you can skip this step
                    and choose one later, or ask our staff.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {eligiblePlans.map((p) => {
                      const isSelected = form.plan_id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => set("plan_id", isSelected ? "" : p.id)}
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
                                  One day only · {formatEventDate(p.event_date)}
                                </span>
                              )
                            ) : (
                              <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                {p.validity_value} {p.validity_unit} validity
                              </span>
                            )}
                          </div>
                          {p.plan_type !== "special" && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {WEEKDAY_LABELS.map((label, day) => (
                                <span
                                  key={day}
                                  className={`text-[10px] font-semibold w-6 h-6 rounded-full flex items-center justify-center ${
                                    p.allowed_weekdays.includes(day)
                                      ? "bg-brand-leaf/15 text-brand-leaf"
                                      : "bg-brand-ink/5 text-brand-ink/25"
                                  }`}
                                >
                                  {label[0]}
                                </span>
                              ))}
                            </div>
                          )}
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
              </>
            )}

            {step === "Finish" && (
              <>
                <div>
                  <label className={labelClass()}>
                    How did you hear about us?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {HOW_HEARD_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => set("how_heard", opt)}
                        className={`text-sm font-medium px-3 py-2 rounded-full border-2 transition-colors ${
                          form.how_heard === opt
                            ? "bg-brand-sky text-white border-brand-sky"
                            : "bg-white text-brand-ink/60 border-brand-sky/20"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-start gap-3 text-sm text-brand-ink/70">
                  <input
                    type="checkbox"
                    checked={form.photo_consent}
                    onChange={(e) => set("photo_consent", e.target.checked)}
                    className="accent-brand-sky w-5 h-5 mt-0.5 shrink-0"
                  />
                  I allow QureoCity to take photos of my child at play for
                  advertising purposes.
                </label>
                <label className="flex items-start gap-3 text-sm text-brand-ink/70">
                  <input
                    type="checkbox"
                    checked={form.whatsapp_consent}
                    onChange={(e) => set("whatsapp_consent", e.target.checked)}
                    className="accent-brand-sky w-5 h-5 mt-0.5 shrink-0"
                  />
                  I'd like to receive updates and promotions via WhatsApp.
                </label>

                {selectedPlan && (
                  <div className="bg-brand-cloud rounded-xl2 p-4 text-sm">
                    <p className="font-semibold text-brand-ink mb-1">
                      Selected plan: {selectedPlan.name}
                    </p>
                    <p className="text-brand-ink/50 text-xs">
                      ₹{selectedPlan.price} · {selectedPlan.validity_value}{" "}
                      {selectedPlan.validity_unit}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-7">
            {step === "Finish" ? (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full min-h-[56px] rounded-xl2 bg-brand-sky text-white font-bold text-lg disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit registration"}
              </button>
            ) : (
              <button
                onClick={goNext}
                className="w-full min-h-[56px] rounded-xl2 bg-brand-sky text-white font-bold text-lg"
              >
                Continue
              </button>
            )}
          </div>
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
