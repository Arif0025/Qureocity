"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayISTDateString } from "@/lib/istTime";
import { Calendar, Clock, IndianRupee, PartyPopper } from "lucide-react";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  code: string;
  event_date: string;
  hours_per_visit: number;
  price: number;
};

function formatEventDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function SpecialDaysBrowser() {
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = todayISTDateString();
      const { data } = await supabase
        .from("membership_plans")
        .select("*")
        .eq("active", true)
        .eq("plan_type", "special")
        .gte("event_date", today)
        .order("event_date", { ascending: true });
      setPlans((data as Plan[]) ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-brand-cloud flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <img
          src="/logo-full.png"
          alt="QureoCity"
          className="h-14 mx-auto mb-6"
        />
        <h1 className="text-xl font-bold text-brand-ink text-center mb-1">
          Upcoming special days
        </h1>
        <p className="text-sm text-brand-ink/50 text-center mb-6">
          Pick a day to register your child
        </p>

        {loading ? (
          <p className="text-center text-sm text-brand-ink/40 py-10">
            Loading…
          </p>
        ) : plans.length === 0 ? (
          <div className="bg-white rounded-xl2 shadow-sm p-6 text-center">
            <p className="text-brand-ink/50 text-sm">
              Nothing special is scheduled right now — check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <a
                key={p.id}
                href={`/checkin/special/${p.code.toLowerCase()}`}
                className="block bg-white rounded-xl2 shadow-sm p-5 hover:shadow-md transition-shadow animate-popIn"
              >
                <div className="flex items-center gap-2 mb-1">
                  <PartyPopper
                    size={16}
                    className="text-brand-coral shrink-0"
                  />
                  <p className="font-extrabold text-brand-ink">{p.name}</p>
                </div>
                {p.description && (
                  <p className="text-xs text-brand-ink/50 mb-2">
                    {p.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-ink/55">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} /> {formatEventDate(p.event_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {p.hours_per_visit} hrs
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-brand-purpleDeep">
                    <IndianRupee size={12} /> {p.price}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}

        <a
          href="/checkin"
          className="mt-6 block text-center text-sm font-semibold text-brand-ink/40"
        >
          ← Back to check-in
        </a>
      </div>
    </div>
  );
}
