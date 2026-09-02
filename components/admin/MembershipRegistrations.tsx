"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, X, MapPin, School, Heart } from "lucide-react";
import PhoneLinks from "@/components/shared/PhoneLinks";

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

export default function MembershipRegistrations() {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Per-instance channel name — a hardcoded shared name means the
  // second mount's .subscribe() silently fails (see usePendingCount.ts).
  const channelName = useRef(
    `membership_registrations_pending_${Math.random().toString(36).slice(2)}`,
  );

  const refetch = useCallback(async () => {
    const { data } = await supabase.rpc("list_pending_registrations");
    setRows((data as Registration[]) ?? []);
    setLoading(false);
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
    if (data && !(data as any).success) {
      setNotice("Someone already handled this one.");
      void refetch();
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  if (loading) {
    return (
      <p className="text-sm text-brand-nightText/40 text-center py-10">
        Loading…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-10 text-center text-brand-nightText/40 text-sm">
        No pending membership registrations.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notice && (
        <p className="text-sm text-brand-coral bg-brand-coral/10 border border-brand-coral/30 rounded-xl px-4 py-2.5">
          {notice}
        </p>
      )}
      {rows.map((r) => {
        const isOpen = expandedId === r.id;
        return (
          <div
            key={r.id}
            className="bg-brand-nightSurface rounded-xl border border-white/10 overflow-hidden"
          >
            <button
              onClick={() => setExpandedId(isOpen ? null : r.id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-brand-nightText text-sm truncate">
                    {r.child_name}
                    {r.date_of_birth && (
                      <span className="text-brand-nightText/40">
                        {" "}
                        · {ageFromDob(r.date_of_birth)}y
                      </span>
                    )}
                  </p>
                  {r.registration_type === "renewal" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-leaf bg-brand-leaf/10 rounded-full px-2 py-0.5 shrink-0">
                      Renewal
                    </span>
                  )}
                  {r.registration_type === "special" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-sun bg-brand-sun/10 rounded-full px-2 py-0.5 shrink-0">
                      Special day
                    </span>
                  )}
                </div>
                <p className="text-xs text-brand-nightText/40 truncate">
                  {r.parent_name} · {r.plan_name ?? "No plan selected"}
                  {r.plan_event_date &&
                    ` · ${new Date(r.plan_event_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                </p>
              </div>
              <span className="text-[11px] font-mono text-brand-nightText/35 shrink-0">
                {r.receipt_number}
              </span>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-white/10 bg-white/[0.035] space-y-3">
                <div className="grid sm:grid-cols-2 gap-3 mt-3 text-sm">
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

                {r.registration_type !== "renewal" && r.how_heard && (
                  <p className="text-xs text-brand-nightText/35">
                    Heard about us via {r.how_heard ?? "—"} · Photo consent:{" "}
                    {r.photo_consent ? "Yes" : "No"} · WhatsApp updates:{" "}
                    {r.whatsapp_consent ? "Yes" : "No"}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handle(r.id, "confirm")}
                    disabled={busyId === r.id}
                    className="flex-1 min-h-[36px] flex items-center justify-center gap-1.5 rounded-lg bg-brand-leaf text-white text-xs font-semibold hover:bg-brand-leaf/85 disabled:opacity-50"
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
                    className="min-h-[36px] flex items-center justify-center gap-1.5 rounded-lg bg-white/8 text-brand-nightText/70 text-xs font-semibold px-3 hover:bg-brand-coral/15 hover:text-brand-coral disabled:opacity-50"
                  >
                    <X size={14} />
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
