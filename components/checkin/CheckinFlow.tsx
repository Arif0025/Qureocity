"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClientKey } from "@/lib/clientKey";
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

type Step = "phone" | "returning" | "new" | "confirmed";

export default function CheckinFlow() {
  const supabase = createClient();
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [confirmedSessions, setConfirmedSessions] = useState<
    { session_id: string; end_time: string | null }[]
  >([]);

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
    (sessions: { session_id: string; end_time: string | null }[]) => {
      setConfirmedSessions(sessions);
      setStep("confirmed");
    },
    [],
  );

  const handleStartOver = useCallback(() => {
    setStep("phone");
    setPhone("");
    setLookup(null);
    setConfirmedSessions([]);
    setError(null);
    setJustRegistered(false);
  }, []);

  return (
    <div className="min-h-screen bg-brand-cloud flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <img
          src="/logo-full.png"
          alt="QureoCity"
          className="h-16 mx-auto mb-6"
        />

        {error && (
          <div className="mb-4 rounded-xl2 bg-brand-coral/10 border border-brand-coral text-brand-coral px-4 py-3 text-sm font-medium animate-popIn">
            {error}
          </div>
        )}

        <div key={step} className="animate-popIn">
          {step === "phone" && (
            <PhoneEntry onSubmit={handlePhoneSubmit} loading={loading} />
          )}

          {step === "returning" && lookup?.found && (
            <ReturningCustomer
              customerId={lookup.customer_id}
              parentName={lookup.parent_name}
              children={lookup.children}
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
