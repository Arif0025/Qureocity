"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import KidsCheckedInCard, { SessionRow } from "./KidsCheckedInCard";
import StaffOnSiteCard from "./StaffOnSiteCard";
import CheckInActivityCard from "./CheckInActivityCard";
import CheckinActivityFull from "./CheckinActivityFull";
import LiveFloorView from "../LiveFloorView";
import ShiftStatusSummary from "../ShiftStatusSummary";

type OnDutyLog = {
  employee_id: string;
  punch_in: string;
  employees: { name: string } | null;
};
type Shift = {
  id: string;
  employee_id: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  employees: { name: string } | null;
};
type AttendanceLog = {
  id: string;
  employee_id: string;
  punch_in: string;
  punch_out: string | null;
  auto_punched_out?: boolean;
  employees: { name: string } | null;
};

type Drill = "none" | "kids" | "staff" | "activity";

export default function HomeOverview({
  initialSessions,
  todayCheckinCount,
  venueCapacity,
  onDutyStaff,
  totalStaff,
  shifts,
  attendanceLogs,
  dailyCounts,
  onInspectStaffEmployee,
  onOpenCustomerDirectory,
}: {
  initialSessions: SessionRow[];
  todayCheckinCount: number;
  venueCapacity: number;
  onDutyStaff: OnDutyLog[];
  totalStaff: number;
  shifts: Shift[];
  attendanceLogs: AttendanceLog[];
  dailyCounts: { day: string; cnt: number }[];
  onInspectStaffEmployee: (employeeId: string) => void;
  onOpenCustomerDirectory: (customerKey: string) => void;
}) {
  const [drill, setDrill] = useState<Drill>("none");

  if (drill !== "none") {
    const titles: Record<Exclude<Drill, "none">, string> = {
      kids: "Kids checked in",
      staff: "Who's on duty",
      activity: "Check-in activity",
    };
    return (
      <div>
        <button
          onClick={() => setDrill("none")}
          className="flex items-center gap-1.5 text-sm font-medium text-brand-nightText/50 hover:text-brand-nightText mb-4 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Home
        </button>
        <h1 className="text-lg font-bold text-brand-nightText mb-6">
          {titles[drill]}
        </h1>
        {drill === "kids" && (
          <LiveFloorView initialSessions={initialSessions} />
        )}
        {drill === "staff" && (
          <ShiftStatusSummary
            shifts={shifts}
            attendanceLogs={attendanceLogs}
            onEmployeeSelect={onInspectStaffEmployee}
          />
        )}
        {drill === "activity" && (
          <CheckinActivityFull dailyCounts={dailyCounts} />
        )}
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
      <KidsCheckedInCard
        initialSessions={initialSessions}
        todayCheckinCount={todayCheckinCount}
        venueCapacity={venueCapacity}
        onViewAll={() => setDrill("kids")}
        onOpenCustomerDirectory={onOpenCustomerDirectory}
      />
      <StaffOnSiteCard
        initialOnDutyStaff={onDutyStaff}
        totalStaff={totalStaff}
        onViewAll={() => setDrill("staff")}
      />
      <CheckInActivityCard
        dailyCounts={dailyCounts}
        onViewFull={() => setDrill("activity")}
      />
    </div>
  );
}
