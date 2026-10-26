"use client";

import { useEffect, useState, useCallback, useRef, useId } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, X, MapPin, School, Heart } from "lucide-react";
import PhoneLinks from "@/components/shared/PhoneLinks";
import ListRow from "@/components/shared/ListRow";
import Badge from "@/components/ui/Badge";
import ContactMessageSheet from "@/components/shared/ContactMessageSheet";

// Directory's "Pending" filter. Same data and the same confirm/discard
// RPCs as the old standalone Pending tab — this is a restyle onto the
// shared ListRow so it matches the rest of Directory, not a logic
// change. Reports its count up so the filter pill can show a badge.
type Registration = {
  id: string;
  receipt_number: string;
  registration_type: "new" | "renewal" | "special";
  child_name: string;
  date_of_birth: string;
  gender: string | null;
  school: string | null;
  interests: string[];
  allergies: string | null;
  medical_conditions: string | null;
  special_instructions: string | null;
  parent_name: string;
  phone: string;
  secondary_phone: string | null;
  address: string | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_type: "recurring" | "special" | null;
  plan_event_date: string | null;
  special_event_date: string | null;
  how_heard: string | null;
  photo_consent: boolean;
  whatsapp_consent: boolean;
  submitted_at: string;
};

function ageFromDob(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export default function PendingList({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [response, setResponse] = useState<{ registration: Registration; approved: boolean } | null>(null);
  const instanceId = useId().replace(/:/g, "");
  const channelName = useRef(`directory_pending_${instanceId}`);

  const refetch = useCallback(async () => {
    const { data } = await supabase.rpc("list_pending_registrations");
    const next = (data as Registration[]) ?? [];
    setRows(next);
    setLoading(false);
    onCountChange?.(next.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    void refetch();
    const channel = supabase
      .channel(channelName.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "membership_registrations" },
        refetch,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refetch]);

  const handle = async (id: string, action: "confirm" | "discard") => {
    setBusyId(id);
    setNotice(null);
    const { data, error } = await supabase.rpc(
      action === "confirm"
        ? "confirm_membership_registration"
        : "discard_membership_registration",
      { p_registration_id: id },
    );
    setBusyId(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    if (data && !(data as { success?: boolean }).success) {
      setNotice("Someone already handled this one.");
      void refetch();
      return;
    }
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      onCountChange?.(next.length);
      return next;
    });
    setResponse({ registration: rows.find((row) => row.id === id)!, approved: action === "confirm" });
  };

  if (loading) {
    return <p className="text-sm text-brand-nightText/40 py-6">Loading…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl2 border border-white/10 bg-brand-nightSurface p-10 text-center text-brand-nightText/40 text-sm">
        No pending registrations.
      </div>
    );
  }

  const responseRegistration = response?.registration;
  const responseLabel = responseRegistration?.registration_type === "special"
    ? `special-day registration for ${responseRegistration.plan_name ?? "the event"}`
    : responseRegistration?.registration_type === "renewal" ? "membership renewal" : "membership";
  const responseIsSpecial = responseRegistration?.registration_type === "special";
  const responseTemplateKey = responseIsSpecial
    ? response?.approved ? "special_day_approved" as const : "special_day_declined" as const
    : response?.approved ? "membership_approved" as const : "membership_declined" as const;
  const responseValues = responseRegistration ? {
    parent_name: responseRegistration.parent_name,
    child_name: responseRegistration.child_name,
    date_of_birth: responseRegistration.date_of_birth,
    plan_name: responseRegistration.plan_name ?? (responseIsSpecial ? "the event" : "membership"),
    request_type: responseLabel,
    event_date: responseRegistration.special_event_date ?? responseRegistration.plan_event_date ?? "",
    business_name: "QureoCity",
  } : {};
  const responseFallback = responseRegistration
    ? response?.approved
      ? responseIsSpecial
        ? "Hi {{parent_name}}, {{child_name}}'s special-day registration for {{plan_name}} is confirmed. We look forward to welcoming you!"
        : "Hi {{parent_name}}, {{child_name}}'s {{plan_name}} has been approved and their subscription is now active. We look forward to welcoming you!"
      : "Hi {{parent_name}}, unfortunately we’re unable to approve {{child_name}}'s {{request_type}} request at this time. Please contact us if you have any questions."
    : "";

  return (
    <>
    <div className="space-y-2.5">
      {notice && (
        <p className="text-sm text-brand-coral bg-brand-coral/10 border border-brand-coral/30 rounded-xl2 px-4 py-2.5">
          {notice}
        </p>
      )}
      {rows.map((r) => {
        const isOpen = expandedId === r.id;
        const eventDate = r.special_event_date ?? r.plan_event_date;
        return (
          <ListRow
            key={r.id}
            title={r.child_name}
            subtitle={
              r.date_of_birth ? `${ageFromDob(r.date_of_birth)}y` : undefined
            }
            safetyFlag={
              r.registration_type === "renewal" ? (
                <Badge tone="success">Renewal</Badge>
              ) : r.registration_type === "special" ? (
                <Badge tone="warning">Special day</Badge>
              ) : undefined
            }
            facts={[
              { value: r.parent_name },
              {
                value: r.plan_name ?? "No plan selected",
                hideOnMobile: true,
              },
              ...(eventDate
                ? [
                    {
                      value: new Date(
                        eventDate + "T00:00:00",
                      ).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      }),
                      hideOnMobile: true,
                    },
                  ]
                : []),
            ]}
            action={
              <span className="text-[11px] font-mono text-brand-nightText/35 shrink-0">
                {r.receipt_number}
              </span>
            }
            expanded={isOpen}
            onToggleExpand={() => setExpandedId(isOpen ? null : r.id)}
            expandedContent={
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mb-1">
                      Child
                    </p>
                    <p className="text-brand-nightText">
                      {r.child_name}
                      {r.gender ? ` · ${r.gender}` : ""}
                    </p>
                    {r.school && (
                      <p className="flex items-center gap-1 text-xs text-brand-nightText/50 mt-1">
                        <School size={12} /> {r.school}
                      </p>
                    )}
                    {r.interests.length > 0 && (
                      <p className="text-xs text-brand-nightText/50 mt-1">
                        Interests: {r.interests.join(", ")}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mb-1">
                      Guardian
                    </p>
                    <p className="text-brand-nightText">{r.parent_name}</p>
                    <PhoneLinks
                      phone={r.phone}
                      secondaryPhone={r.secondary_phone}
                      className="flex items-center gap-1 text-xs text-brand-nightText/50 mt-1 hover:text-brand-sky"
                      showNumber
                    />
                    {r.address && (
                      <p className="flex items-center gap-1 text-xs text-brand-nightText/50 mt-1">
                        <MapPin size={12} /> {r.address}
                      </p>
                    )}
                  </div>
                </div>

                {(r.allergies ||
                  r.medical_conditions ||
                  r.special_instructions) && (
                  <div className="rounded-lg bg-brand-coral/8 border border-brand-coral/20 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-coral uppercase tracking-wide mb-1.5">
                      <Heart size={12} /> Medical
                    </p>
                    {r.allergies && (
                      <p className="text-xs text-brand-nightText/70">
                        Allergies: {r.allergies}
                      </p>
                    )}
                    {r.medical_conditions && (
                      <p className="text-xs text-brand-nightText/70">
                        Conditions: {r.medical_conditions}
                      </p>
                    )}
                    {r.special_instructions && (
                      <p className="text-xs text-brand-nightText/70">
                        Notes: {r.special_instructions}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handle(r.id, "confirm")}
                    disabled={busyId === r.id}
                    className="flex-1 min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl2 bg-brand-leaf text-white text-sm font-semibold hover:bg-brand-leaf/85 disabled:opacity-50"
                  >
                    <Check size={14} />
                    {busyId === r.id
                      ? "Confirming…"
                      : r.registration_type === "renewal"
                        ? "Confirm renewal"
                        : r.registration_type === "special"
                          ? "Confirm special day"
                          : "Confirm membership"}
                  </button>
                  <button
                    onClick={() => handle(r.id, "discard")}
                    disabled={busyId === r.id}
                    className="min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl2 bg-white/8 text-brand-nightText/70 text-sm font-semibold px-3.5 hover:bg-brand-coral/15 hover:text-brand-coral disabled:opacity-50"
                  >
                    <X size={14} />
                    Decline
                  </button>
                </div>
              </div>
            }
          />
        );
      })}
    </div>
    {responseRegistration && <ContactMessageSheet
      open={Boolean(response)}
      onClose={() => setResponse(null)}
      title={response.approved ? "Registration approved" : "Registration declined"}
      phone={responseRegistration.phone}
      initialMessage={responseFallback}
      templateKey={responseTemplateKey}
      templateValues={responseValues}
      canManageTemplates
      askBeforeSend={!response.approved}
    />}
    </>
  );
}
