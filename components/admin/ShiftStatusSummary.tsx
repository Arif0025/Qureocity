type ShiftRow = {
  id: string;
  employee_id: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  employees: { name: string } | null;
};

type AttendanceRow = {
  id: string;
  employee_id: string;
  punch_in: string;
  punch_out: string | null;
  auto_punched_out?: boolean;
  employees: { name: string } | null;
};

type DutyState = "present" | "left" | "auto_left" | "absent" | "upcoming";

function timeLabel(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}

function punchTimeLabel(value: string): string {
  // Attendance timestamps are stored in UTC; display them consistently in
  // the venue's India time zone instead of using the server/browser locale.
  const indiaOffsetMinutes = 330;
  const shifted = new Date(new Date(value).getTime() + indiaOffsetMinutes * 60_000);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}

function shiftDate(value: string): Date {
  const now = new Date();
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
    0,
    0,
  );
}

function stateMeta(state: DutyState) {
  if (state === "present")
    return { label: "Present", tone: "text-brand-leaf bg-brand-leaf/10" };
  if (state === "left")
    return { label: "Left", tone: "text-brand-ink bg-black/5" };
  if (state === "auto_left")
    return { label: "Auto clocked out", tone: "text-brand-sky bg-brand-sky/10" };
  if (state === "upcoming")
    return { label: "Upcoming", tone: "text-brand-sun bg-brand-sun/10" };
  return { label: "Absent", tone: "text-brand-coral bg-brand-coral/10" };
}

function determineState(
  shift: ShiftRow,
  attendanceByEmployee: Map<string, AttendanceRow>,
): { state: DutyState; detail: string } {
  const now = new Date();
  const start = shiftDate(shift.start_time);
  const log = attendanceByEmployee.get(shift.employee_id) ?? null;

  if (now < start) {
    return {
      state: "upcoming",
      detail: `Starts at ${timeLabel(shift.start_time)}`,
    };
  }

  if (log) {
    const punchInTime = new Date(log.punch_in);
    if (false && punchInTime > start) {
      return {
        state: "absent",
        detail: `Expected ${timeLabel(shift.start_time)}–${timeLabel(shift.end_time)}`,
      };
    }

    const punchIn = punchTimeLabel(log.punch_in);
    if (!log.punch_out) {
      return { state: "present", detail: `In at ${punchIn}, still punched in` };
    }

    const punchOut = punchTimeLabel(log.punch_out);
    if (log.auto_punched_out) {
      return { state: "auto_left", detail: `Auto clocked out at ${punchOut}` };
    }
    return { state: "left", detail: `In at ${punchIn}, out at ${punchOut}` };
  }

  return {
    state: "absent",
    detail: `Expected ${timeLabel(shift.start_time)}–${timeLabel(shift.end_time)}`,
  };
}

export default function ShiftStatusSummary({
  shifts,
  attendanceLogs,
}: {
  shifts: ShiftRow[];
  attendanceLogs: AttendanceRow[];
}) {
  if (shifts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-5 text-sm text-brand-ink/40">
        No shifts assigned yet.
      </div>
    );
  }

  const attendanceByEmployee = new Map<string, AttendanceRow>();
  const todayKey = new Date().toDateString();
  for (const log of attendanceLogs) {
    if (new Date(log.punch_in).toDateString() !== todayKey) continue;
    if (!attendanceByEmployee.has(log.employee_id)) {
      attendanceByEmployee.set(log.employee_id, log);
    }
  }

  const order: Record<DutyState, number> = {
    present: 0,
    absent: 1,
    left: 2,
    auto_left: 3,
    upcoming: 4,
  };
  const ordered = shifts
    .map((shift) => ({
      shift,
      ...determineState(shift, attendanceByEmployee),
    }))
    .sort((a, b) =>
      order[a.state] - order[b.state] ||
      (a.shift.employees?.name ?? "").localeCompare(
        b.shift.employees?.name ?? "",
      ),
    );

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-semibold text-brand-ink">Who’s on duty today</p>
        <p className="text-xs text-brand-ink/40">
          Present, left, absent, or upcoming
        </p>
      </div>
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {ordered.map(({ shift, state, detail }) => {
          const meta = stateMeta(state);

          return (
            <div
              key={shift.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-black/5 px-4 py-3"
            >
              <div>
                <p className="font-medium text-brand-ink">
                  {shift.employees?.name ?? "—"}
                </p>
                <p className="text-xs text-brand-ink/45">{detail}</p>
                {shift.notes && (
                  <p className="text-xs text-brand-ink/40 mt-1">
                    {shift.notes}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${meta.tone}`}
              >
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
