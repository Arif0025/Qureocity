"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Phone, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";

type DailyCount = { day: string; cnt: number };
const CLOSED_WEEKDAY = 2;

type DayDetail = {
  checkins: {
    session_id: string;
    child_name: string;
    parent_name: string;
    parent_phone: string;
    checked_in_at: string;
    checked_out_at: string | null;
    status: string;
  }[];
  staff: {
    employee_name: string;
    punch_in: string;
    punch_out: string | null;
    auto_punched_out: boolean;
  }[];
};

function dayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return `${values.year}-${values.month}-${values.day}`;
}

function intensityClass(count: number, maxCount: number): string {
  if (count === 0)
    return "bg-white/[0.08] text-brand-nightText/40 ring-1 ring-inset ring-white/10";
  const ratio = count / maxCount;
  if (ratio <= 0.25)
    return "bg-brand-sky/30 text-brand-nightText ring-1 ring-inset ring-brand-sky/20";
  if (ratio <= 0.5)
    return "bg-brand-sky/55 text-brand-nightText ring-1 ring-inset ring-brand-sky/25";
  if (ratio <= 0.75)
    return "bg-brand-sky/80 text-white ring-1 ring-inset ring-brand-sky/30";
  return "bg-brand-sky text-white ring-1 ring-inset ring-white/20";
}

function timeStr(v: string) {
  return formatTimeIST(v);
}

export default function CheckinActivityFull({
  dailyCounts,
}: {
  dailyCounts: DailyCount[];
}) {
  const supabase = createClient();
  const countByDay = useMemo(
    () => new Map(dailyCounts.map((d) => [d.day, Number(d.cnt)])),
    [dailyCounts],
  );
  const maxCount = useMemo(
    () => Math.max(1, ...dailyCounts.map((d) => Number(d.cnt))),
    [dailyCounts],
  );

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [savingSession, setSavingSession] = useState(false);

  const toLocalIST = (iso: string) =>
    new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16);

  const toIsoIST = (value: string) =>
    new Date(`${value}:00+05:30`).toISOString();

  const calendarStart = new Date(cursor);
  calendarStart.setDate(1 - calendarStart.getDay());
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(calendarStart);
    d.setDate(calendarStart.getDate() + i);
    return d;
  });

  const loadDay = useCallback(
    async (key: string) => {
      setSelectedDay(key);
      setLoading(true);
      const { data, error } = await supabase.rpc("admin_day_detail", {
        p_day: key,
      });
      setLoading(false);
      if (error) {
        setDetail({ checkins: [], staff: [] });
        return;
      }
      setDetail(data as DayDetail);
    },
    [supabase],
  );

  const startEdit = (session: DayDetail["checkins"][number]) => {
    setEditingSessionId(session.session_id);
    setEditStart(toLocalIST(session.checked_in_at));
    setEditEnd(
      session.checked_out_at ? toLocalIST(session.checked_out_at) : "",
    );
  };

  const saveSession = async () => {
    if (!editingSessionId || !editStart) return;
    setSavingSession(true);
    const start = toIsoIST(editStart);
    const end = editEnd ? toIsoIST(editEnd) : null;
    const { error } = await supabase.rpc("admin_update_walkin_session", {
      p_session_id: editingSessionId,
      p_started_at: start,
      p_ended_at: end,
    });
    setSavingSession(false);
    if (error) {
      alert(error.message);
      return;
    }
    setEditingSessionId(null);
    if (selectedDay) void loadDay(selectedDay);
  };

  const removeSession = async (sessionId: string) => {
    if (!window.confirm("Remove this walk-in session? This cannot be undone."))
      return;
    const { error } = await supabase.rpc("admin_delete_walkin_session", {
      p_session_id: sessionId,
    });
    if (error) {
      alert(error.message);
      return;
    }
    if (selectedDay) void loadDay(selectedDay);
  };

  useEffect(() => {
    const todayKey = dayKey(new Date());
    void loadDay(todayKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-5">
        <div className="flex items-center justify-between mb-5">
          <p className="font-semibold text-brand-nightText text-lg">
            {cursor.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const d = new Date(cursor);
                d.setMonth(d.getMonth() - 1);
                setCursor(d);
              }}
              className="p-2 rounded-lg hover:bg-white/8 text-brand-nightText/50"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => {
                const d = new Date(cursor);
                d.setMonth(d.getMonth() + 1);
                setCursor(d);
              }}
              className="p-2 rounded-lg hover:bg-white/8 text-brand-nightText/50"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <span
              key={d}
              className="text-center text-xs font-medium text-brand-nightText/40"
            >
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const key = dayKey(day);
            const inMonth = day.getMonth() === cursor.getMonth();
            const isClosed = day.getDay() === CLOSED_WEEKDAY;
            const isFuture = day > new Date();
            const count = countByDay.get(key) ?? 0;
            return (
              <button
                key={key}
                disabled={!inMonth || isFuture}
                onClick={() => void loadDay(key)}
                className={`aspect-square rounded-xl text-sm font-medium flex flex-col items-center justify-center gap-0.5 transition-all disabled:opacity-20 ${
                  isClosed
                    ? "bg-white/[0.08] text-brand-nightText/30 ring-1 ring-inset ring-white/10"
                    : intensityClass(count, maxCount)
                } ${selectedDay === key ? "ring-2 ring-brand-ink ring-offset-1" : ""}`}
              >
                <span>{day.getDate()}</span>
                {inMonth && !isClosed && !isFuture && (
                  <span className="text-[9px] opacity-70">
                    {count > 0 ? count : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-brand-nightText/40 mt-5">
          <span className="w-3 h-3 rounded-sm bg-white/[0.05] border border-dashed border-white/20" />
          Closed (Tuesdays) &nbsp;·&nbsp;
          <span className="w-3 h-3 rounded-sm bg-brand-sky/20" />
          Light &nbsp;·&nbsp;
          <span className="w-3 h-3 rounded-sm bg-brand-sky" />
          Busy
        </div>
      </div>

      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-5 h-fit lg:sticky lg:top-6">
        {selectedDay ? (
          <>
            <p className="font-semibold text-brand-nightText mb-4">
              {new Date(selectedDay + "T00:00:00Z").toLocaleDateString(
                undefined,
                {
                  timeZone: "Asia/Kolkata",
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                },
              )}
            </p>
            {loading ? (
              <p className="text-sm text-brand-nightText/40">Loading…</p>
            ) : (
              <div className="space-y-6 max-h-[560px] overflow-y-auto pr-1">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-nightText/40 mb-2">
                    Checked in ({detail?.checkins.length ?? 0})
                  </p>
                  {!detail?.checkins.length ? (
                    <p className="text-sm text-brand-nightText/35">
                      No check-ins.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {detail.checkins.map((c, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-white/10 px-3 py-2"
                        >
                          <p className="text-sm font-medium text-brand-nightText">
                            {c.child_name}
                          </p>
                          <p className="text-xs text-brand-nightText/45">
                            {c.parent_name} · {timeStr(c.checked_in_at)}
                            {c.checked_out_at
                              ? `–${timeStr(c.checked_out_at)}`
                              : ""}
                          </p>
                          <div className="mt-2 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => startEdit(c)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-sky"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeSession(c.session_id)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-coral"
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          </div>
                          {editingSessionId === c.session_id && (
                            <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                              <label className="block text-xs text-brand-nightText/50">
                                Check-in time
                                <input
                                  type="datetime-local"
                                  value={editStart}
                                  onChange={(event) =>
                                    setEditStart(event.target.value)
                                  }
                                  className="mt-1 w-full rounded-lg border border-white/15 bg-brand-nightSurface2 px-2 py-1.5 text-xs text-brand-nightText [color-scheme:dark]"
                                />
                              </label>
                              <label className="block text-xs text-brand-nightText/50">
                                Check-out time (blank = still on site)
                                <input
                                  type="datetime-local"
                                  value={editEnd}
                                  onChange={(event) =>
                                    setEditEnd(event.target.value)
                                  }
                                  className="mt-1 w-full rounded-lg border border-white/15 bg-brand-nightSurface2 px-2 py-1.5 text-xs text-brand-nightText [color-scheme:dark]"
                                />
                              </label>
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => void saveSession()}
                                  disabled={savingSession}
                                  className="text-xs font-semibold text-brand-leaf disabled:opacity-50"
                                >
                                  {savingSession ? "Saving…" : "Save"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSessionId(null)}
                                  className="text-xs font-semibold text-brand-nightText/45"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-nightText/40 mb-2">
                    Staff on shift ({detail?.staff.length ?? 0})
                  </p>
                  {!detail?.staff.length ? (
                    <p className="text-sm text-brand-nightText/35">
                      No attendance records.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {detail.staff.map((s, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-white/10 px-3 py-2"
                        >
                          <p className="text-sm font-medium text-brand-nightText">
                            {s.employee_name}
                          </p>
                          <p className="text-xs text-brand-nightText/45">
                            {timeStr(s.punch_in)}
                            {s.punch_out
                              ? `–${timeStr(s.punch_out)}`
                              : " – still on duty"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-brand-nightText/35">
            Select a day to see who checked in and who was on shift.
          </p>
        )}
      </div>
    </div>
  );
}
