type OnDutyLog = { employee_id: string; punch_in: string; employees: { name: string } | null };

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5">
      <p className="text-sm text-brand-ink/50 mb-1">{label}</p>
      <p className="text-3xl font-extrabold text-brand-ink">{value}</p>
      {sub && <p className="text-xs text-brand-ink/40 mt-1">{sub}</p>}
    </div>
  );
}

export default function AnalyticsOverview({
  activeCount,
  venueCapacity,
  todayCheckinCount,
  avgDurationMins,
  onDutyStaff,
}: {
  activeCount: number;
  venueCapacity: number;
  todayCheckinCount: number;
  avgDurationMins: number | null;
  onDutyStaff: OnDutyLog[];
}) {
  const capacityPct = Math.min(100, Math.round((activeCount / venueCapacity) * 100));
  const capacityColor =
    capacityPct >= 90 ? "bg-brand-coral" : capacityPct >= 70 ? "bg-brand-sun" : "bg-brand-leaf";

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Kids checked in now" value={String(activeCount)} sub={`of ${venueCapacity} capacity`} />
        <StatCard label="Check-ins today" value={String(todayCheckinCount)} />
        <StatCard
          label="Avg. visit length today"
          value={avgDurationMins ? `${avgDurationMins}m` : "—"}
          sub={avgDurationMins ? undefined : "No timed sessions yet today"}
        />
        <StatCard label="Staff on duty" value={String(onDutyStaff.length)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
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
            <p className="text-sm text-brand-ink/40">No one is currently punched in.</p>
          ) : (
            <ul className="space-y-2">
              {onDutyStaff.map((log) => (
                <li key={log.employee_id} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-brand-ink">{log.employees?.name ?? "—"}</span>
                  <span className="text-brand-ink/40">
                    since {new Date(log.punch_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
