type OnDutyLog = {
  employee_id: string;
  punch_in: string;
  employees: { name: string } | null;
};
type AgeBucket = { bucket: string; cnt: number };
type DailyCount = { day: string; cnt: number };

function StatCard({
  label,
  value,
  sub,
  emoji,
  accent,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  emoji: string;
  accent: string;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="bg-white rounded-2xl border border-black/5 p-5 flex items-start gap-3 text-left w-full transition-colors hover:border-brand-sky/30 hover:shadow-sm cursor-pointer"
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${accent}`}
        >
          {emoji}
        </div>
        <div>
          <p className="text-sm text-brand-ink/50 mb-0.5">{label}</p>
          <p className="text-2xl font-extrabold text-brand-ink leading-tight">
            {value}
          </p>
          {sub && <p className="text-xs text-brand-ink/40 mt-0.5">{sub}</p>}
        </div>
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5 flex items-start gap-3">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${accent}`}
      >
        {emoji}
      </div>
      <div>
        <p className="text-sm text-brand-ink/50 mb-0.5">{label}</p>
        <p className="text-2xl font-extrabold text-brand-ink leading-tight">
          {value}
        </p>
        {sub && <p className="text-xs text-brand-ink/40 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const BUCKET_ORDER = ["0-3", "4-6", "7-9", "10-12", "13+"];

function AgeBreakdown({ ageBuckets }: { ageBuckets: AgeBucket[] }) {
  const counts = Object.fromEntries(
    ageBuckets.map((b) => [b.bucket, Number(b.cnt)]),
  );
  const max = Math.max(1, ...BUCKET_ORDER.map((b) => counts[b] ?? 0));
  const total = BUCKET_ORDER.reduce((sum, b) => sum + (counts[b] ?? 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5">
      <p className="font-semibold text-brand-ink mb-1">
        Today's check-ins by age
      </p>
      <p className="text-xs text-brand-ink/40 mb-4">
        {total === 0 ? "No check-ins yet today" : `${total} total`}
      </p>
      <div className="space-y-3">
        {BUCKET_ORDER.map((bucket) => {
          const count = counts[bucket] ?? 0;
          const pct = Math.round((count / max) * 100);
          return (
            <div key={bucket} className="flex items-center gap-3">
              <span className="w-12 text-sm font-medium text-brand-ink/60 shrink-0">
                {bucket}
              </span>
              <div className="flex-1 h-6 rounded-full bg-black/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-sky transition-all"
                  style={{ width: `${count === 0 ? 0 : Math.max(pct, 6)}%` }}
                />
              </div>
              <span className="w-6 text-sm font-semibold text-brand-ink text-right shrink-0">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Venue is closed Tuesdays — change this if that ever changes.
// 0 = Sunday, 1 = Monday, 2 = Tuesday, ...
const CLOSED_WEEKDAY = 3;
const WEEKS_SHOWN = 14;

type Cell = {
  date: string;
  count: number;
  weekday: number;
  isClosed: boolean;
} | null;

function intensityClass(count: number): string {
  // Fixed bands rather than "relative to the busiest day in view" — a
  // relative scale makes 2 check-ins look maxed-out on a quiet week and
  // meaningless once real volume shows up. These thresholds are sized
  // for a single-location venue; adjust if daily volume changes a lot.
  if (count === 0) return "bg-black/5";
  if (count <= 5) return "bg-brand-sky/25";
  if (count <= 15) return "bg-brand-sky/50";
  if (count <= 30) return "bg-brand-sky/75";
  return "bg-brand-sky";
}

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function ActivityHeatmap({ dailyCounts }: { dailyCounts: DailyCount[] }) {
  const countByDay = new Map(dailyCounts.map((d) => [d.day, Number(d.cnt)]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Anchor the grid to a real Sunday so every column is a genuine
  // calendar week (Sun–Sat), the way GitHub's graph works — rather than
  // arbitrary 7-day chunks counted back from today.
  const totalDays = WEEKS_SHOWN * 7;
  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - (totalDays - 1) - today.getDay());

  const cells: Cell[] = [];
  const cursor = new Date(rangeStart);
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    const weekday = cursor.getDay();
    cells.push({
      date: key,
      count: countByDay.get(key) ?? 0,
      weekday,
      isClosed: weekday === CLOSED_WEEKDAY,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthLabelForWeek = new Map<number, string>();
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstReal = week.find((c) => c !== null);
    if (!firstReal) return;
    const month = new Date(firstReal.date + "T00:00:00").getMonth();
    if (month !== lastMonth) {
      monthLabelForWeek.set(
        wi,
        new Date(firstReal.date + "T00:00:00").toLocaleDateString(undefined, {
          month: "short",
        }),
      );
      lastMonth = month;
    }
  });

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-semibold text-brand-ink">Check-in activity</p>
        <div className="flex items-center gap-1.5 text-[11px] text-brand-ink/40">
          <span>Less</span>
          <span className="w-3 h-3 rounded-sm bg-black/5" />
          <span className="w-3 h-3 rounded-sm bg-brand-sky/25" />
          <span className="w-3 h-3 rounded-sm bg-brand-sky/50" />
          <span className="w-3 h-3 rounded-sm bg-brand-sky/75" />
          <span className="w-3 h-3 rounded-sm bg-brand-sky" />
          <span>More</span>
          <span
            className="w-3 h-3 rounded-sm bg-black/10 ml-2"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 3px)",
            }}
          />
          <span>Closed</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex gap-[3px] mb-1 pl-6">
            {weeks.map((_, wi) => (
              <div
                key={wi}
                className="w-3.5 text-[10px] text-brand-ink/40 shrink-0"
              >
                {monthLabelForWeek.get(wi) ?? ""}
              </div>
            ))}
          </div>

          <div className="flex gap-[3px]">
            <div className="flex flex-col gap-[3px] mr-1 w-5 shrink-0">
              {WEEKDAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="h-3.5 text-[10px] text-brand-ink/40 leading-[14px]"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell, ri) =>
                    cell === null ? (
                      <div key={ri} className="w-3.5 h-3.5" />
                    ) : (
                      <div
                        key={ri}
                        title={
                          cell.isClosed
                            ? `${cell.date}: Closed`
                            : `${cell.date}: ${cell.count} check-in${cell.count === 1 ? "" : "s"}`
                        }
                        className={`w-3.5 h-3.5 rounded-sm ${cell.isClosed ? "bg-black/5" : intensityClass(cell.count)}`}
                        style={
                          cell.isClosed
                            ? {
                                backgroundImage:
                                  "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 3px)",
                              }
                            : undefined
                        }
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsOverview({
  activeCount,
  venueCapacity,
  todayCheckinCount,
  avgDurationMins,
  onDutyStaff,
  ageBuckets,
  dailyCounts,
  onKidsCheckedIn,
  onAttendance,
}: {
  activeCount: number;
  venueCapacity: number;
  todayCheckinCount: number;
  avgDurationMins: number | null;
  onDutyStaff: OnDutyLog[];
  ageBuckets: AgeBucket[];
  dailyCounts: DailyCount[];
  onKidsCheckedIn: () => void;
  onAttendance: () => void;
}) {
  const capacityPct = Math.min(
    100,
    Math.round((activeCount / venueCapacity) * 100),
  );
  const capacityColor =
    capacityPct >= 90
      ? "bg-brand-coral"
      : capacityPct >= 70
        ? "bg-brand-sun"
        : "bg-brand-leaf";

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Kids checked in now"
          value={String(activeCount)}
          sub={`of ${venueCapacity} capacity`}
          emoji="🧒"
          accent="bg-brand-sky/10"
          onClick={onKidsCheckedIn}
        />
        <StatCard
          label="Check-ins today"
          value={String(todayCheckinCount)}
          emoji="📋"
          accent="bg-brand-sun/15"
          onClick={onKidsCheckedIn}
        />
        <StatCard
          label="Avg. visit length today"
          value={avgDurationMins ? `${avgDurationMins}m` : "—"}
          sub={avgDurationMins ? undefined : "No timed sessions yet today"}
          emoji="⏱️"
          accent="bg-brand-leaf/10"
        />
        <StatCard
          label="Staff on duty"
          value={String(onDutyStaff.length)}
          emoji="🧑‍💼"
          accent="bg-brand-coral/10"
          onClick={onAttendance}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl border border-black/5 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-brand-ink">Floor capacity</p>
            <span className="text-sm text-brand-ink/50">{capacityPct}%</span>
          </div>
          <div className="h-3 rounded-full bg-black/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${capacityColor}`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
          <p className="text-xs text-brand-ink/40 mt-2">
            {capacityPct >= 90
              ? "Near capacity — consider slowing new check-ins."
              : capacityPct >= 70
                ? "Getting busy."
                : "Comfortable levels."}
          </p>
        </div>

        <button
          type="button"
          onClick={onAttendance}
          className="bg-white rounded-2xl border border-black/5 p-5 text-left transition-colors hover:border-brand-sky/30 hover:shadow-sm cursor-pointer"
        >
          <p className="font-semibold text-brand-ink mb-3">Who's on duty</p>
          {onDutyStaff.length === 0 ? (
            <p className="text-sm text-brand-ink/40">
              No one is currently punched in.
            </p>
          ) : (
            <ul className="space-y-2">
              {onDutyStaff.map((log) => (
                <li
                  key={log.employee_id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium text-brand-ink">
                    {log.employees?.name ?? "—"}
                  </span>
                  <span className="text-brand-ink/40">
                    since{" "}
                    {new Date(log.punch_in).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <AgeBreakdown ageBuckets={ageBuckets} />
        <ActivityHeatmap dailyCounts={dailyCounts} />
      </div>
    </div>
  );
}
