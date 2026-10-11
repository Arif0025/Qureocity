"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Cake, ChevronDown, Clock3, PartyPopper, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";

type PartyPlan = {
  id: string; name: string; description: string | null; price: number;
  kids_count: number; adults_count: number; includes_cake: boolean;
  includes_snacks: boolean; decorations_type: string | null;
  duration_minutes: number; area_type: "party_room" | "entire_play_area";
};
type BookingSettings = { open: string; close: string };
type Availability = "idle" | "checking" | "available" | "unavailable" | "error";

const todayInIndia = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const CUSTOM_PLAN_ID = "__custom_party__";

const fieldClass = "min-h-12 w-full rounded-xl border border-brand-sky/20 bg-white px-4 text-base text-brand-ink placeholder:text-brand-ink/35 outline-none focus:border-brand-sky";

export default function PartyBookingFlow() {
  const supabase = useMemo(() => createClient(), []);
  const [plans, setPlans] = useState<PartyPlan[]>([]);
  const [settings, setSettings] = useState<BookingSettings>({ open: "10:00", close: "20:00" });
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [customDuration, setCustomDuration] = useState(60);
  const [customArea, setCustomArea] = useState<PartyPlan["area_type"]>("party_room");
  const [customKids, setCustomKids] = useState(0);
  const [customAdults, setCustomAdults] = useState(0);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [parentName, setParentName] = useState("");
  const [childName, setChildName] = useState("");
  const [phone, setPhone] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingRef, setBookingRef] = useState<string | null>(null);
  const [customRequestSubmitted, setCustomRequestSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from("party_plans")
        .select("id, name, description, price, kids_count, adults_count, includes_cake, includes_snacks, decorations_type, duration_minutes, area_type")
        .eq("active", true).order("price", { ascending: true }),
      supabase.from("app_settings")
        .select("party_booking_open_time, party_booking_close_time")
        .eq("id", true).single(),
    ]).then(([planResult, settingsResult]) => {
      if (!active) return;
      setPlans((planResult.data as PartyPlan[]) ?? []);
      if (settingsResult.data) setSettings({
        open: String(settingsResult.data.party_booking_open_time).slice(0, 5),
        close: String(settingsResult.data.party_booking_close_time).slice(0, 5),
      });
      if (planResult.error) setError("Party packages could not be loaded. Please try again later.");
      setLoadingPlans(false);
    });
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!selectedPlanId || !date || !time) { setAvailability("idle"); return; }
    const isCustom = selectedPlanId === CUSTOM_PLAN_ID;
    setAvailability("checking");
    let active = true;
    const timer = window.setTimeout(async () => {
      const startAt = new Date(`${date}T${time}:00+05:30`).toISOString();
      const { data, error: checkError } = await supabase.rpc("check_party_booking_availability", {
        p_plan_id: isCustom ? null : selectedPlanId,
        p_start_at: startAt,
        p_duration_minutes: isCustom ? customDuration : null,
        p_area_type: isCustom ? customArea : null,
      });
      if (!active) return;
      if (checkError) setAvailability("error");
      else setAvailability(data ? "available" : "unavailable");
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [selectedPlanId, date, time, customDuration, customArea, supabase]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const isCustom = selectedPlanId === CUSTOM_PLAN_ID;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step !== 3) return;
    setError(null);
    if (!selectedPlan && !isCustom) return setError("Choose a party package.");
    if (availability !== "available") return setError("Choose a date and available start time first.");
    if (isCustom && !customMessage.trim()) return setError("Describe the party you have in mind so the team can prepare a quote.");
    const normalizedPhone = phone.replace(/\D/g, "");
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) return setError("Enter a valid phone number.");
    setSubmitting(true);
    const startAt = new Date(`${date}T${time}:00+05:30`).toISOString();
    const { data, error: submitError } = await supabase.rpc("register_party_booking", {
      p_plan_id: selectedPlan?.id ?? null,
      p_parent_name: parentName.trim(),
      p_phone: normalizedPhone,
      p_child_name: childName.trim(),
      p_start_at: startAt,
      p_client_key: getClientKey(),
      p_custom_request: isCustom,
      p_request_message: isCustom ? customMessage.trim() : null,
      p_duration_minutes: isCustom ? customDuration : null,
      p_area_type: isCustom ? customArea : null,
      p_kids_count: isCustom ? customKids : null,
      p_adults_count: isCustom ? customAdults : null,
    });
    setSubmitting(false);
    if (submitError) {
      setAvailability("unavailable");
      setStep(2);
      setError(submitError.message.includes("unavailable")
        ? "That slot was just taken. Choose another date or time."
        : submitError.message);
      return;
    }
    const result = data as { booking_id: string };
    setCustomRequestSubmitted(isCustom);
    setBookingRef(result.booking_id);
  };

  if (bookingRef) return (
    <main className="min-h-screen bg-brand-cloud px-4 py-10">
      <section className="mx-auto max-w-lg rounded-3xl border border-brand-leaf/25 bg-white p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-leaf/15 text-brand-leaf"><PartyPopper size={25} /></span>
        <h1 className="text-2xl font-extrabold text-brand-ink">Request received</h1>
        <p className="mt-2 text-sm leading-6 text-brand-ink/60">{customRequestSubmitted ? "Your custom party idea is saved. The team will review it, prepare a quote, and contact you using the phone number you provided." : "Your party booking request is awaiting admin approval. We’ll contact you using the phone number you provided."}</p>
        <p className="mt-5 rounded-xl bg-brand-cloud px-4 py-3 text-xs text-brand-ink/55">Request reference<br /><strong className="mt-1 block break-all font-mono text-brand-ink">{bookingRef}</strong></p>
        <a href="/checkin" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-sky px-4 text-sm font-bold text-white"><ArrowLeft size={15} /> Back to check-in</a>
      </section>
    </main>
  );

  return (
    <main className="min-h-screen bg-brand-cloud px-4 py-7 sm:py-10">
      <section className="mx-auto max-w-2xl">
        <a href="/checkin" className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-ink/55 hover:bg-white/50"><ArrowLeft size={16} /> Check-in</a>
        <header className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-coral/15 text-brand-coral"><PartyPopper size={23} /></span>
          <h1 className="text-2xl font-extrabold text-brand-ink">Book a party</h1>
          <p className="mt-1 text-sm text-brand-ink/55">Choose a package and request an available date and time.</p>
        </header>

        <ol aria-label="Booking steps" className="mb-4 grid grid-cols-3 gap-2">
          {["Package", "Date & time", "Contact"].map((label, index) => {
            const number = (index + 1) as 1 | 2 | 3;
            const current = step === number;
            const complete = step > number;
            return <li key={label} aria-current={current ? "step" : undefined} className={`rounded-xl border px-2 py-2 text-center text-xs font-semibold ${current ? "border-brand-sky bg-brand-sky/10 text-brand-sky" : complete ? "border-brand-leaf/20 bg-brand-leaf/10 text-brand-leaf" : "border-brand-ink/10 bg-white/70 text-brand-ink/45"}`}><span className="mr-1">{complete ? "✓" : number}</span>{label}</li>;
          })}
        </ol>

        {loadingPlans ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-brand-ink/55">Loading party packages…</p> : plans.length === 0 ? <div className="rounded-2xl bg-white p-6 text-center"><p className="font-semibold text-brand-ink">No party packages are available right now.</p><p className="mt-1 text-sm text-brand-ink/55">Please contact the venue to ask about party bookings.</p></div> : (
          <form onSubmit={submit} className="space-y-4">
            {step === 1 && <>
            <fieldset className="space-y-2.5">
              <legend className="mb-2 text-sm font-bold text-brand-ink">Choose a package</legend>
              {plans.map((plan) => <button key={plan.id} type="button" onClick={() => { setSelectedPlanId(plan.id); setError(null); }} className={`w-full rounded-2xl border bg-white p-4 text-left transition-colors ${selectedPlanId === plan.id ? "border-brand-sky ring-2 ring-brand-sky/15" : "border-brand-ink/10 hover:border-brand-sky/35"}`}>
                <span className="flex items-start justify-between gap-3"><span className="min-w-0"><strong className="block text-sm font-bold text-brand-ink">{plan.name}</strong><span className="mt-0.5 block text-xs text-brand-ink/55">{plan.description || "Party package"}</span></span><strong className="shrink-0 rounded-full bg-brand-sky/10 px-3 py-1.5 text-sm text-brand-sky">₹{Number(plan.price).toLocaleString("en-IN")}</strong></span>
                <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-ink/60"><span className="inline-flex items-center gap-1"><Users size={12} />{plan.kids_count} kids · {plan.adults_count} adults</span><span className="inline-flex items-center gap-1"><Clock3 size={12} />{plan.duration_minutes} min</span><span className="inline-flex items-center gap-1"><Cake size={12} />Cake: {plan.includes_cake ? "included" : "not included"}</span><span>Snacks: {plan.includes_snacks ? "included" : "not included"}</span><span>Area: {plan.area_type === "entire_play_area" ? "entire first floor" : "party room"}</span><span>Decor: {plan.decorations_type || "not included"}</span></span>
              </button>)}
              <button type="button" onClick={() => { setSelectedPlanId(CUSTOM_PLAN_ID); setError(null); }} className={`w-full rounded-2xl border bg-white p-4 text-left transition-colors ${isCustom ? "border-brand-coral ring-2 ring-brand-coral/15" : "border-brand-ink/10 hover:border-brand-coral/35"}`}>
                <span className="flex items-start justify-between gap-3"><span><strong className="block text-sm font-bold text-brand-ink">Custom party</strong><span className="mt-0.5 block text-xs text-brand-ink/55">Tell us your idea and we’ll prepare a quote.</span></span><span className="shrink-0 rounded-full bg-brand-coral/10 px-3 py-1.5 text-xs font-bold text-brand-coral">Quote</span></span>
              </button>
            </fieldset>

            {isCustom && <section className="space-y-3 rounded-2xl border border-brand-ink/8 bg-white p-4 sm:p-5">
              <h2 className="text-sm font-bold text-brand-ink">Tell us about your party</h2>
              <label className="block space-y-1 text-xs font-medium text-brand-ink/60">Your idea / requirements<textarea required maxLength={2000} rows={4} value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Theme, setup, food, guest count, or anything else you have in mind…" className={`${fieldClass} resize-y py-3`} /></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-medium text-brand-ink/60">Estimated kids<input type="number" min="0" max="100" step="1" value={customKids} onChange={(e) => setCustomKids(Number(e.target.value))} className={fieldClass} /></label><label className="space-y-1 text-xs font-medium text-brand-ink/60">Estimated adults<input type="number" min="0" max="100" step="1" value={customAdults} onChange={(e) => setCustomAdults(Number(e.target.value))} className={fieldClass} /></label><label className="space-y-1 text-xs font-medium text-brand-ink/60">Requested time period (minutes)<input required type="number" min="15" max="600" step="1" value={customDuration} onChange={(e) => setCustomDuration(Number(e.target.value))} className={fieldClass} /></label><label className="space-y-1 text-xs font-medium text-brand-ink/60">Requested area<span className="relative block"><select value={customArea} onChange={(e) => setCustomArea(e.target.value as PartyPlan["area_type"])} className={`${fieldClass} appearance-none pr-10`}><option value="party_room">Party room</option><option value="entire_play_area">Entire first floor</option></select><ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-brand-ink/45" /></span></label></div>
              <p className="text-[11px] text-brand-ink/45">The requested area and duration are used to check availability. The admin can discuss changes with you when preparing the quote.</p>
            </section>}
            <button type="button" disabled={(!selectedPlan && !isCustom) || (isCustom && (!customMessage.trim() || customDuration < 15))} onClick={() => { setError(null); setStep(2); }} className="min-h-12 w-full rounded-xl2 bg-brand-sky px-5 text-sm font-bold text-white shadow-sm transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">Continue to date &amp; time</button>
            </>}

            {step === 2 && <>
            <section className="mb-3 rounded-xl border border-brand-ink/8 bg-white/70 px-4 py-3 text-sm text-brand-ink"><span className="text-brand-ink/50">Selected package</span><strong className="ml-2">{isCustom ? "Custom party" : selectedPlan?.name}</strong></section>
            <section className="space-y-3 rounded-2xl border border-brand-ink/8 bg-white p-4 sm:p-5">
              <h2 className="text-sm font-bold text-brand-ink">Pick a date and start time</h2>
              <p className="text-xs text-brand-ink/50">Choose when you would like the party to start. We’ll check the venue’s availability for that time.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-brand-ink/60">Party date<input required type="date" min={todayInIndia()} value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} /></label>
                <label className="space-y-1 text-xs font-medium text-brand-ink/60">Preferred start time<input required type="time" min={settings.open} max={settings.close} step={60} value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} /></label>
              </div>
              {availability !== "idle" && <p role="status" className={`text-xs font-semibold ${availability === "available" ? "text-brand-leaf" : availability === "checking" ? "text-brand-ink/50" : "text-brand-coral"}`}>{availability === "checking" ? "Checking this time…" : availability === "available" ? "This time is available." : availability === "unavailable" ? "This time is unavailable. Choose a different slot." : "Could not check availability. Please retry."}</p>}
            </section>
            <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => { setError(null); setStep(1); }} className="min-h-12 rounded-xl border border-brand-ink/15 bg-white px-4 text-sm font-semibold text-brand-ink">Back</button><button type="button" disabled={availability !== "available"} onClick={() => { setError(null); setStep(3); }} className="min-h-12 rounded-xl2 bg-brand-sky px-4 text-sm font-bold text-white shadow-sm transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">Continue to contact</button></div>
            </>}

            {step === 3 && <>
            <section className="mb-3 rounded-xl border border-brand-ink/8 bg-white/70 px-4 py-3 text-sm text-brand-ink"><span className="block text-xs text-brand-ink/50">Booking request</span><strong>{isCustom ? "Custom party" : selectedPlan?.name}</strong><span className="mt-1 block text-xs text-brand-ink/60">{date} at {time} IST · {isCustom ? customDuration : selectedPlan?.duration_minutes} minutes</span></section>
            <section className="space-y-3 rounded-2xl border border-brand-ink/8 bg-white p-4 sm:p-5">
              <h2 className="text-sm font-bold text-brand-ink">Your contact details</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-brand-ink/60">Parent / guardian name<input required maxLength={120} autoComplete="name" value={parentName} onChange={(e) => setParentName(e.target.value)} className={fieldClass} /></label>
                <label className="space-y-1 text-xs font-medium text-brand-ink/60">Phone number<input required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} /></label>
                <label className="space-y-1 text-xs font-medium text-brand-ink/60 sm:col-span-2">Child / guest of honor<input required maxLength={120} value={childName} onChange={(e) => setChildName(e.target.value)} className={fieldClass} /></label>
              </div>
            </section>

            {error && <p role="alert" className="rounded-xl border border-brand-coral/25 bg-brand-coral/10 px-3 py-2 text-sm text-brand-coral">{error}</p>}
            <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => { setError(null); setStep(2); }} className="min-h-12 rounded-xl border border-brand-ink/15 bg-white px-4 text-sm font-semibold text-brand-ink">Back</button><button type="submit" disabled={submitting || availability !== "available"} className="min-h-12 rounded-xl2 bg-brand-sky px-4 text-sm font-bold text-white shadow-sm transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Sending…" : isCustom ? "Request quote" : "Request booking"}</button></div>
            <p className="text-center text-[11px] text-brand-ink/45">{isCustom ? "The team will review your idea and contact you with a quote." : "Your slot is confirmed after the venue approves the request."}</p>
            </>}
          </form>
        )}
      </section>
    </main>
  );
}
