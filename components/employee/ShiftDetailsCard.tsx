"use client";

import { useState, useEffect } from "react";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ShiftRow = {
  start_time: string;
  end_time: string;
  notes: string | null;
};

function timeLabel(t: string) {
  // shifts.start_time/end_time are `time` columns ("HH:MM:SS") — plain
  // wall-clock, no timezone involved, so a simple slice is correct here
  // (unlike the timestamptz fields elsewhere that need IST conversion).
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${mStr} ${period}`;
}

export default function ShiftDetailsCard({
  employeeId,
}: {
  employeeId: string;
}) {
  const supabase = createClient();
  const [shift, setShift] = useState<ShiftRow | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("shifts")
        .select("start_time, end_time, notes")
        .eq("employee_id", employeeId)
        .maybeSingle();
      setShift((data as ShiftRow | null) ?? null);
    })();
  }, [supabase, employeeId]);

  if (shift === undefined) return null;

  return (
    <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-4">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock size={16} className="text-brand-sky" />
        <p className="text-sm font-semibold text-brand-nightText">Your shift</p>
      </div>
      {shift ? (
        <>
          <p className="text-lg font-bold text-brand-nightText mt-1">
            {timeLabel(shift.start_time)} – {timeLabel(shift.end_time)}
          </p>
          <p className="text-xs text-brand-nightText/40 mt-0.5">
            Every day the venue is open (closed Tuesdays)
          </p>
          {shift.notes && (
            <p className="text-xs text-brand-nightText/50 mt-2 italic">
              {shift.notes}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-brand-nightText/35 mt-1">
          No shift assigned yet — check with an admin.
        </p>
      )}
    </div>
  );
}
