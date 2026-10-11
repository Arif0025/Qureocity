"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";
import { LogIn, UserPlus, RefreshCw, PartyPopper, ChevronDown } from "lucide-react";
import PhoneEntry from "./PhoneEntry";
import ReturningCustomer from "./ReturningCustomer";
import NewCustomerForm from "./NewCustomerForm";
import ConfirmationScreen from "./ConfirmationScreen";

type Child = {
  id: string;
  name: string;
  age: number;
  currently_checked_in?: boolean;
};
type LookupResult =
  | { found: false }
  | {
      found: true;
      customer_id: string;
      parent_name: string;
      children: Child[];
    };

type Step = "landing" | "phone" | "returning" | "new" | "confirmed";

export default function CheckinFlow() {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<Step>("landing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [confirmedSessions, setConfirmedSessions] = useState<
    { session_id: string; end_time: string | null; status?: string }[]
  >([]);
  const [showMembershipOptions, setShowMembershipOptions] = useState(false);

  // A single indexed lookup (phone is a UNIQUE btree column) — this is
  // sub-millisecond on the DB side even at tens of thousands of rows,
  // so there's no meaningful lag between "done typing" and "see your kids".
  const handlePhoneSubmit = useCallback(
    async (value: string) => {
      setError(null);
      setLoading(true);
      setPhone(value);
      try {
        const { data, error } = await supabase.rpc("checkin_lookup", {
          p_phone: value,
          p_client_key: getClientKey(),
        });
        if (error) throw error;
        setLookup(data as LookupResult);
        setStep(data.found ? "returning" : "new");
      } catch (e: any) {
        setError(e.message ?? "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  const [justRegistered, setJustRegistered] = useState(false);

  const handleRegistered = useCallback(
    (customerId: string, parentName: string, children: Child[]) => {
      setLookup({
        found: true,
        customer_id: customerId,
        parent_name: parentName,
        children,
      });
      setJustRegistered(true);
      setStep("returning");
    },
    [],
  );

  const handleSessionsCreated = useCallback(
    (
      sessions: {
        session_id: string;
        end_time: string | null;
        status?: string;
      }[],
    ) => {
      setConfirmedSessions(sessions);
      setStep("confirmed");
    },
    [],
  );

  const handleStartOver = useCallback(() => {
    setStep("landing");
    setPhone("");
    setLookup(null);
    setConfirmedSessions([]);
    setError(null);
    setJustRegistered(false);
  }, []);

  return (
    <div className="min-h-screen bg-brand-cloud flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link href="/" className="block w-fit mx-auto mb-6">
          <img
            src="/logo-full.png"
            alt="QureoCity — back to home"
            className="h-16"
          />
        </Link>

        {error && (
          <div className="mb-4 rounded-xl2 bg-brand-coral/10 border border-brand-coral text-brand-coral px-4 py-3 text-sm font-medium animate-popIn">
            {error}
          </div>
        )}

        <div key={step} className="animate-popIn">
          {step === "landing" && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h1 className="text-xl font-bold text-brand-ink mb-1">
                  Welcome to QureoCity
                </h1>
                <p className="text-brand-ink/50 text-sm">
                  Are you a member, or checking in for the day?
                </p>
              </div>
              <button
                onClick={() => setStep("phone")}
                className="w-full rounded-xl2 bg-white border-2 border-[#76518A]/25 hover:border-[#76518A] p-5 text-left flex items-center gap-4 transition-colors"
              >
                  <div className="w-12 h-12 rounded-full bg-[#76518A]/10 flex items-center justify-center shrink-0">
                  <LogIn size={22} className="text-[#76518A]" />
                </div>
                <div>
                  <p className="font-bold text-brand-ink">Walk-in</p>
                  <p className="text-xs text-brand-ink/50">
                    For today&apos;s visit — pay-per-visit
                  </p>
                </div>
              </button>
              <div className="overflow-hidden rounded-xl2 border-2 border-[#527347]/25 bg-white">
                <button type="button" aria-expanded={showMembershipOptions} onClick={() => setShowMembershipOptions((open) => !open)} className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-[#527347]/[0.03]">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#527347]/10"><UserPlus size={22} className="text-[#527347]" /></div>
                  <div className="min-w-0 flex-1"><p className="font-bold text-brand-ink">Memberships</p><p className="text-xs text-brand-ink/50">Register or renew a membership</p></div>
                  <ChevronDown size={19} className={`text-[#527347] transition-transform ${showMembershipOptions ? "rotate-180" : ""}`} />
                </button>
                {showMembershipOptions && <div className="grid grid-cols-2 gap-2 border-t border-brand-ink/10 p-3">
                  <a href="/checkin/register" className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#527347]/10 px-3 text-sm font-bold text-[#46633D] transition-colors hover:bg-[#527347]/15"><UserPlus size={16} />Register</a>
                  <a href="/checkin/renew" className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#527347]/10 px-3 text-sm font-bold text-[#46633D] transition-colors hover:bg-[#527347]/15"><RefreshCw size={16} />Renewal</a>
                </div>}
              </div>
              <Link
                href="/checkin/party"
                className="w-full rounded-xl2 bg-white border-2 border-[#946D2F]/25 hover:border-[#946D2F] p-5 text-left flex items-center gap-4 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-[#946D2F]/10 flex items-center justify-center shrink-0">
                  <PartyPopper size={22} className="text-[#946D2F]" />
                </div>
                <div>
                  <p className="font-bold text-brand-ink">Book a party</p>
                  <p className="text-xs text-brand-ink/50">
                    Choose a party package and request a date and time
                  </p>
                </div>
              </Link>
              <Link
                href="/checkin/special"
                className="w-full rounded-xl2 bg-white border-2 border-[#9F514A]/25 hover:border-[#9F514A] p-5 text-left flex items-center gap-4 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-brand-coral/15 flex items-center justify-center shrink-0">
                  <PartyPopper size={22} className="text-[#9F514A]" />
                </div>
                <div>
                  <p className="font-bold text-brand-ink">Special days</p>
                  <p className="text-xs text-brand-ink/50">
                    See upcoming events and register your kids
                  </p>
                </div>
              </Link>
            </div>
          )}

          {step === "phone" && (
            <>
              <PhoneEntry onSubmit={handlePhoneSubmit} loading={loading} />
              <button
                onClick={() => setStep("landing")}
                className="mt-4 block w-full text-center text-sm font-semibold text-brand-ink/40"
              >
                ← Back
              </button>
            </>
          )}

          {step === "returning" && lookup?.found && (
            <ReturningCustomer
              customerId={lookup.customer_id}
              parentName={lookup.parent_name}
              childRecords={lookup.children}
              onConfirmed={handleSessionsCreated}
              onError={setError}
              defaultSelectedIds={
                justRegistered ? lookup.children.map((c) => c.id) : undefined
              }
            />
          )}

          {step === "new" && (
            <NewCustomerForm
              phone={phone}
              onRegistered={handleRegistered}
              onError={setError}
            />
          )}

          {step === "confirmed" && (
            <ConfirmationScreen
              sessions={confirmedSessions}
              onDone={handleStartOver}
            />
          )}
        </div>
      </div>
    </div>
  );
}
