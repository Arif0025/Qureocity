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
  employees: { name: string } | null;
};

type DutyState = "present" | "left" | "absent" | "upcoming";

function timeLabel(value: string): string {
  return new Date(`1970-01-01T${value}`).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
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
    if (punchInTime > start) {
      return {
        state: "absent",
        detail: `Expected ${timeLabel(shift.start_time)}–${timeLabel(shift.end_time)}`,
      };
    }

    const punchIn = new Date(log.punch_in).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (!log.punch_out) {
      return { state: "present", detail: `In at ${punchIn}, still punched in` };
    }

    const punchOut = new Date(log.punch_out).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
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

  const ordered = [...shifts].sort((a, b) =>
    (a.employees?.name ?? "").localeCompare(b.employees?.name ?? ""),
  );

  const counts = ordered.reduce(
    (acc, shift) => {
      const { state } = determineState(shift, attendanceByEmployee);
      acc[state] += 1;
      return acc;
    },
    { present: 0, left: 0, absent: 0, upcoming: 0 } as Record<DutyState, number>,
  );

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-semibold text-brand-ink">Today's duty status</p>
        <p className="text-xs text-brand-ink/40">
          Present, left, absent, or upcoming
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {(
          [
            ["present", "Present", "bg-brand-leaf/10 text-brand-leaf"],
            ["left", "Left", "bg-black/5 text-brand-ink"],
            ["absent", "Absent", "bg-brand-coral/10 text-brand-coral"],
            ["upcoming", "Upcoming", "bg-brand-sun/10 text-brand-sun"],
          ] as const
        ).map(([key, label, tone]) => (
          <div key={key} className={`rounded-xl px-3 py-2 ${tone}`}>
            <p className="text-[11px] font-medium opacity-70">{label}</p>
            <p className="text-lg font-bold leading-tight">{counts[key]}</p>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {ordered.map((shift) => {
          const { state, detail } = determineState(shift, attendanceByEmployee);
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
