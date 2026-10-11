"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import KidsCheckedInCard from "./KidsCheckedInCard";
import TeamTodayCard from "./TeamTodayCard";
import TodayCheckinStat from "./TodayCheckinStat";
import MonthlyStatsCard from "./MonthlyStatsCard";
import CheckinActivityFull from "./CheckinActivityFull";
import SpecialDaysCard from "./SpecialDaysCard";
import { todayISTDateString } from "@/lib/istTime";

type Drill = "none" | "activity";

export default function HomeOverview({
  venueCapacity,
  onOpenCustomerDirectory,
  onNewFamiliesClick,
  onNewMembershipsClick,
  onExpiringClick,
  onOpenPlan,
}: {
  venueCapacity: number;
  onOpenCustomerDirectory: (customerKey: string, childId?: string) => void;
  onNewFamiliesClick?: () => void;
  onNewMembershipsClick?: () => void;
  onExpiringClick?: () => void;
  onOpenPlan?: (
    planId: string | null,
    planType: "recurring" | "special",
  ) => void;
}) {
  const [drill, setDrill] = useState<Drill>("none");
  const [selectedDay, setSelectedDay] = useState(todayISTDateString);

  if (drill === "activity") {
    return (
      <div>
        <button onClick={() => setDrill("none")} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-brand-nightText/50 transition-colors hover:text-brand-nightText">
          <ArrowLeft size={16} /> Back to Home
        </button>
        <h1 className="mb-6 text-lg font-bold text-brand-nightText">Check-in activity</h1>
        <CheckinActivityFull />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TodayCheckinStat selectedDay={selectedDay} onSelectedDayChange={setSelectedDay} onOpenCustomerDirectory={onOpenCustomerDirectory} />
      <div className="grid md:grid-cols-2 gap-5 items-start">
        <KidsCheckedInCard
          venueCapacity={venueCapacity}
          onOpenCustomerDirectory={onOpenCustomerDirectory}
        />
        <TeamTodayCard />
      </div>
      <MonthlyStatsCard
        onActivityClick={() => setDrill("activity")}
        onNewFamiliesClick={onNewFamiliesClick}
        onNewMembershipsClick={onNewMembershipsClick}
        onExpiringClick={onExpiringClick}
      />
      <SpecialDaysCard
        onOpenDay={(planId) => onOpenPlan?.(planId, "special")}
        onOpenPlans={() => onOpenPlan?.(null, "special")}
      />
    </div>
  );
}
