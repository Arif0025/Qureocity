"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeIST } from "@/lib/formatTime";
import { todayISTDateString } from "@/lib/istTime";
import BottomSheet from "@/components/ui/BottomSheet";
import { tapScale } from "@/lib/motion";
import MessageButton from "@/components/shared/MessageButton";

type VisitType = "membership" | "walk_in" | "special";
type Summary = { visit_type: VisitType; cnt: number }[];
type Checkin = {
  session_id: string;
  child_id: string;
  child_name: string;
  parent_name: string;
  parent_phone: string;
  checked_in_at: string;
  checked_out_at: string | null;
  visit_type: VisitType;
  plan_name: string | null;
  membership_started_on: string | null;
  membership_expires_on: string | null;
  is_membership_expired: boolean;
};
type CalendarPosition = { top: number; left: number; width: number };

const segments: { type: VisitType; label: string; color: string }[] = [
  { type: "membership", label: "Members", color: "rgb(var(--checkin-membership))" },
  { type: "walk_in", label: "Walk-ins", color: "rgb(var(--checkin-walkin))" },
  { type: "special", label: "Special events", color: "rgb(var(--checkin-special))" },
];

function time(value: string | null) {
  return value ? formatTimeIST(value) : "Still on site";
}

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateLabel(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function monthKey(day: string) {
  return day.slice(0, 7);
}

export default function TodayCheckinStat({
  selectedDay,
  onSelectedDayChange,
  onOpenCustomerDirectory,
}: {
  selectedDay: string;
  onSelectedDayChange: (day: string) => void;
  onOpenCustomerDirectory: (customerKey: string, childId?: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VisitType | "all" | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(monthKey(selectedDay));
  const [calendarPosition, setCalendarPosition] = useState<CalendarPosition | null>(null);
  const calendarButtonRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<Checkin[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    const from = new Date(`${selectedDay}T00:00:00+05:30`);
    const until = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const { data: result, error } = await supabase.rpc("checkin_type_summary", {
      p_since: from.toISOString(), p_until: until.toISOString(),
    });
    if (!error) setData((result as Summary) ?? []);
    setLoading(false);
  }, [selectedDay, supabase]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const countFor = (type: VisitType) => Number(data?.find((row) => row.visit_type === type)?.cnt ?? 0);
  const total = data?.reduce((sum, row) => sum + Number(row.cnt), 0) ?? 0;
  const ring = 2 * Math.PI * 43;
  const arcGap = 14;
  const activeSegmentCount = segments.filter((segment) => countFor(segment.type) > 0).length;
  let consumed = 0;
  const arcs = segments.map((segment) => {
    const count = countFor(segment.type);
    const length = total ? (count / total) * ring : 0;
    const gap = activeSegmentCount > 1 ? Math.min(arcGap, length * 0.3) : 0;
    const arc = { ...segment, count, length: Math.max(0, length - gap), offset: consumed };
    consumed += length;
    return arc;
  });

  const openList = async (type: VisitType | "all") => {
    setSelected(type);
    setItems([]);
    setDetailLoading(true);
    const { data: result, error } = await supabase.rpc("admin_today_checkin_list", {
      p_day: selectedDay,
      p_visit_type: type === "all" ? null : type,
    });
    if (!error) setItems((result as Checkin[]) ?? []);
    setDetailLoading(false);
  };

  const heading = selected === "all" ? `All check-ins · ${dateLabel(selectedDay)}` : `${segments.find((s) => s.type === selected)?.label ?? "Check-ins"} · ${dateLabel(selectedDay)}`;
  const monthDate = new Date(`${calendarMonth}-01T12:00:00Z`);
  const firstOfMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1));
  const calendarStart = new Date(firstOfMonth);
  calendarStart.setUTCDate(1 - firstOfMonth.getUTCDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setUTCDate(calendarStart.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const maxCalendarMonth = monthKey(todayISTDateString());

  return (
    <>
      <section className="relative rounded-2xl border border-white/10 bg-brand-nightSurface p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-nightText/40">Daily overview</p>
            <h2 className="mt-1 text-lg font-semibold text-brand-nightText">Check-ins</h2>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 sm:justify-end">
            <motion.button type="button" whileTap={tapScale} onClick={() => onSelectedDayChange(shiftDay(selectedDay, -1))}
              aria-label="Previous day" className="rounded-lg border border-white/10 p-2 text-brand-nightText/55 transition-colors hover:bg-white/5 hover:text-brand-nightText">
              <ChevronLeft size={16} />
            </motion.button>
            <div>
            <motion.button ref={calendarButtonRef} type="button" whileTap={tapScale} onClick={() => {
              if (calendarOpen) { setCalendarOpen(false); return; }
              setCalendarMonth(monthKey(selectedDay));
              const rect = calendarButtonRef.current?.getBoundingClientRect();
              if (rect) {
                const width = Math.min(304, window.innerWidth - 24);
                const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
                const estimatedHeight = 370;
                const below = rect.bottom + 8;
                const top = below + estimatedHeight <= window.innerHeight - 12 ? below : Math.max(12, rect.top - estimatedHeight - 8);
                setCalendarPosition({ top, left, width });
              }
              setCalendarOpen(true);
            }}
              aria-haspopup="dialog" aria-expanded={calendarOpen}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm font-medium text-brand-nightText hover:bg-white/5">
              <CalendarDays size={15} className="shrink-0 text-brand-skyLight" />
              <span className="whitespace-nowrap">{selectedDay === todayISTDateString() ? "Today · " : ""}{new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${selectedDay}T12:00:00Z`))}</span>
            </motion.button>
            {calendarOpen && calendarPosition && <div role="dialog" aria-label="Choose check-in date" style={{ position: "fixed", top: calendarPosition.top, left: calendarPosition.left, width: calendarPosition.width }} className="z-[80] max-h-[min(90dvh,400px)] overflow-y-auto rounded-2xl border border-white/10 bg-brand-nightSurface p-3.5 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <button type="button" onClick={() => { const date = new Date(`${calendarMonth}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1); setCalendarMonth(date.toISOString().slice(0, 7)); }} aria-label="Previous month" className="rounded-lg p-1.5 text-brand-nightText/55 hover:bg-white/5"><ChevronLeft size={16} /></button>
                <p className="text-sm font-semibold text-brand-nightText">{new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate)}</p>
                <button type="button" disabled={calendarMonth >= maxCalendarMonth} onClick={() => { const date = new Date(`${calendarMonth}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); setCalendarMonth(date.toISOString().slice(0, 7)); }} aria-label="Next month" className="rounded-lg p-1.5 text-brand-nightText/55 hover:bg-white/5 disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-brand-nightText/40">{["S", "M", "T", "W", "T", "F", "S"].map((weekday, index) => <span key={`${weekday}${index}`} className="py-1">{weekday}</span>)}</div>
              <div className="grid grid-cols-7 gap-1">{calendarDays.map((day) => {
                const isCurrentMonth = monthKey(day) === calendarMonth;
                const disabled = !isCurrentMonth || day > todayISTDateString();
                const active = day === selectedDay;
                return <button key={day} type="button" disabled={disabled} onClick={() => { onSelectedDayChange(day); setCalendarOpen(false); }}
                  className={`aspect-square rounded-lg text-xs transition-colors disabled:cursor-default disabled:opacity-20 ${active ? "bg-brand-sky text-white" : isCurrentMonth ? "text-brand-nightText hover:bg-brand-sky/15" : "text-brand-nightText/20"}`}>
                  {Number(day.slice(-2))}
                </button>;
              })}</div>
              <button type="button" onClick={() => { onSelectedDayChange(todayISTDateString()); setCalendarOpen(false); }} className="mt-3 w-full rounded-lg border border-white/10 py-2 text-xs font-semibold text-brand-skyLight hover:bg-white/5">Jump to today</button>
            </div>}
            </div>
            <motion.button type="button" whileTap={tapScale} onClick={() => onSelectedDayChange(shiftDay(selectedDay, 1))}
              disabled={selectedDay >= todayISTDateString()} aria-label="Next day" className="rounded-lg border border-white/10 p-2 text-brand-nightText/55 transition-colors hover:bg-white/5 hover:text-brand-nightText disabled:opacity-30">
              <ChevronRight size={16} />
            </motion.button>
          </div>
        </div>

        <div className="grid items-center gap-4 sm:grid-cols-[minmax(180px,240px)_1fr] sm:gap-8">
          <div className="relative mx-auto aspect-square w-[min(58vw,220px)] sm:w-full sm:max-w-[220px]">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90 overflow-visible" role="img" aria-label={`${total} total check-ins for ${dateLabel(selectedDay)}`}>
              <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" className="text-brand-nightText/[0.07]" strokeWidth="10" />
              {arcs.filter((arc) => arc.count > 0).map((arc) => (
                <motion.circle key={arc.type} cx="50" cy="50" r="43" fill="none" stroke={arc.color} strokeWidth="10" strokeLinecap={activeSegmentCount === 1 ? "butt" : "round"}
                  strokeDasharray={`${arc.length} ${ring}`} strokeDashoffset={-arc.offset}
                  initial={{ strokeDasharray: `0 ${ring}` }} animate={{ strokeDasharray: `${arc.length} ${ring}` }}
                  transition={{ duration: 0.75, delay: 0.08, ease: "easeOut" }} />
              ))}
            </svg>
            <motion.button type="button" whileTap={tapScale} onClick={() => void openList("all")} disabled={loading}
              className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-skyLight"
              aria-label={`View all ${total} check-ins for ${dateLabel(selectedDay)}`}>
              {loading ? <LoaderCircle className="animate-spin text-brand-nightText/35" size={23} /> : <>
                <motion.span key={total} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold tracking-tight text-brand-nightText">{total}</motion.span>
                <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-brand-nightText/40">total check-ins</span>
              </>}
            </motion.button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {arcs.map((arc) => (
              <motion.button key={arc.type} type="button" whileTap={tapScale} onClick={() => void openList(arc.type)}
                className="flex min-h-[76px] min-w-0 flex-col items-start justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5 text-left transition-colors hover:bg-white/[0.06] sm:min-h-[96px] sm:p-3.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: arc.color }} />
                  <span className="truncate text-[9px] leading-tight text-brand-nightText/55 sm:text-sm">{arc.label}</span>
                </span>
                <span className="block text-xl font-semibold leading-none text-brand-nightText sm:text-2xl">{loading ? "—" : arc.count}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      <BottomSheet open={selected !== null} onClose={() => setSelected(null)} title={heading} floatAboveBottom>
        <div className="mb-3 flex items-center gap-2 text-xs text-brand-nightText/45">
          <Users size={14} /> {items.length} check-ins
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {detailLoading ? <div className="flex justify-center py-12"><LoaderCircle size={22} className="animate-spin text-brand-sky" /></div> : items.length === 0 ?
            <p className="py-10 text-center text-sm text-brand-nightText/45">No check-ins in this group for this date.</p> : items.map((item) => (
              <details key={item.session_id} className="group rounded-xl border border-white/10 bg-brand-nightSurface2 px-3.5 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-brand-nightText">{item.child_name}</span><span className="mt-0.5 block truncate text-xs text-brand-nightText/45">{item.parent_name}</span></span>
                  <span className="shrink-0 text-right text-[11px] text-brand-nightText/55"><span className="block">{time(item.checked_in_at)}</span><span className="mt-0.5 block">{time(item.checked_out_at)}</span></span>
                  <ChevronDown size={15} className="text-brand-nightText/35 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs text-brand-nightText/60">
                  <p>
                    {item.visit_type === "special"
                      ? `Special event · ${item.plan_name ?? "Pass"}`
                      : item.visit_type === "membership"
                        ? `Membership · ${item.plan_name ?? "Member"}`
                        : `Walk-in visit${item.plan_name ? ` · ${item.plan_name}` : ""}`}
                    {item.is_membership_expired && (
                      <span className="ml-2 rounded-full bg-brand-coral/15 px-2 py-0.5 text-[10px] font-semibold text-brand-coral">
                        Expired
                      </span>
                    )}
                  </p>
                  {item.membership_started_on && <p>Membership: {item.membership_started_on} — {item.membership_expires_on ?? "No expiry"}</p>}
                  <p>Parent: {item.parent_name} · {item.parent_phone}</p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <a href={`tel:${item.parent_phone}`} className="flex min-h-9 items-center justify-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-brand-nightText">Call</a>
                    <MessageButton phone={item.parent_phone} parentName={item.parent_name} childName={item.child_name} showLabel canManageTemplates className="min-h-9 w-full rounded-lg !px-3 !py-0" />
                    <button type="button" onClick={() => onOpenCustomerDirectory(item.parent_phone, item.child_id)} className="col-span-2 min-h-9 rounded-lg bg-brand-sky/15 px-3 text-xs font-semibold text-brand-skyLight">View details</button>
                  </div>
                </div>
              </details>
            ))}
        </div>
      </BottomSheet>
    </>
  );
}
