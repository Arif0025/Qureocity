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
}: {
  label: string;
  value: string;
  sub?: string;
  emoji: string;
  accent: string;
}) {
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

function ActivityHeatmap({ dailyCounts }: { dailyCounts: DailyCount[] }) {
  const countByDay = new Map(dailyCounts.map((d) => [d.day, Number(d.cnt)]));
  const days: { date: string; count: number }[] = [];
  const today = new Date();

  for (let i = 69; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: countByDay.get(key) ?? 0 });
  }

  const max = Math.max(1, ...days.map((d) => d.count));
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const intensity = (count: number) => {
    if (count === 0) return "bg-black/5";
    const ratio = count / max;
    if (ratio > 0.75) return "bg-brand-sky";
    if (ratio > 0.5) return "bg-brand-sky/70";
    if (ratio > 0.25) return "bg-brand-sky/40";
    return "bg-brand-sky/20";
  };

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-semibold text-brand-ink">Last 10 weeks</p>
        <div className="flex items-center gap-1 text-xs text-brand-ink/40">
          <span>Quiet</span>
          <span className="w-3 h-3 rounded-sm bg-black/5" />
          <span className="w-3 h-3 rounded-sm bg-brand-sky/20" />
          <span className="w-3 h-3 rounded-sm bg-brand-sky/40" />
          <span className="w-3 h-3 rounded-sm bg-brand-sky/70" />
          <span className="w-3 h-3 rounded-sm bg-brand-sky" />
          <span>Busy</span>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} check-in${d.count === 1 ? "" : "s"}`}
                className={`w-3.5 h-3.5 rounded-sm ${intensity(d.count)}`}
              />
            ))}
          </div>
        ))}
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
}: {
  activeCount: number;
  venueCapacity: number;
  todayCheckinCount: number;
  avgDurationMins: number | null;
  onDutyStaff: OnDutyLog[];
  ageBuckets: AgeBucket[];
  dailyCounts: DailyCount[];
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
        />
        <StatCard
          label="Check-ins today"
          value={String(todayCheckinCount)}
          emoji="📋"
          accent="bg-brand-sun/15"
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

        <div className="bg-white rounded-2xl border border-black/5 p-5">
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
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <AgeBreakdown ageBuckets={ageBuckets} />
        <ActivityHeatmap dailyCounts={dailyCounts} />
      </div>
    </div>
  );
}
