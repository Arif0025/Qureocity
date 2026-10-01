"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Toggle from "@/components/shared/Toggle";
import {
  CHILD_EVENTS,
  EMPLOYEE_SCOPE_LABELS,
  PUSH_EVENTS,
  PUSH_EVENT_META,
  type EmployeeScope,
  type PushEventType,
} from "@/lib/push/events";

type Rule = {
  event_type: PushEventType;
  enabled: boolean;
  employee_scope: EmployeeScope;
  show_child_name: boolean;
  params: Record<string, unknown>;
};

type Person = {
  id: string;
  name: string;
  role: string;
  device_count: number;
  events: string[];
};

const SCOPES: EmployeeScope[] = ["none", "on_duty", "all"];

// Admin-only: decides which notifications exist for the venue, when they
// fire, and whether employees can receive them. Each person still opts
// in on their own device (see NotificationsCard) — this only controls
// what is *available* to them.
export default function NotificationRulesManager() {
  const supabase = createClient();
  const [saved, setSaved] = useState<Record<string, Rule>>({});
  const [draft, setDraft] = useState<Record<string, Rule>>({});
  const [minutesText, setMinutesText] = useState("10");
  const [repeatText, setRepeatText] = useState("15");
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState<string | null>(null);
  const [broadcastNotes, setBroadcastNotes] = useState<Record<string, string>>(
    {},
  );

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc(
      "admin_notification_overview",
    );
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const overview = data as { rules: Rule[]; people: Person[] };
    const map: Record<string, Rule> = {};
    overview.rules.forEach((r) => (map[r.event_type] = r));
    setSaved(map);
    setDraft(JSON.parse(JSON.stringify(map)));
    setMinutesText(
      String((map.session_ending?.params?.minutes_before as number) ?? 10),
    );
    setRepeatText(
      String((map.session_overdue?.params?.repeat_minutes as number) ?? 15),
    );
    setPeople(overview.people);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (event: PushEventType, changes: Partial<Rule>) =>
    setDraft((prev) => ({
      ...prev,
      [event]: { ...prev[event], ...changes },
    }));

  const patchParam = (event: PushEventType, key: string, value: unknown) =>
    setDraft((prev) => ({
      ...prev,
      [event]: {
        ...prev[event],
        params: { ...prev[event].params, [key]: value },
      },
    }));

  const currentDraft = (event: PushEventType): Rule => {
    const rule = draft[event];
    if (event === "session_ending" && rule) {
      return {
        ...rule,
        params: { ...rule.params, minutes_before: Number(minutesText) },
      };
    }
    if (event === "session_overdue" && rule) {
      return {
        ...rule,
        params: { ...rule.params, repeat_minutes: Number(repeatText) },
      };
    }
    return rule;
  };

  const isDirty = (event: PushEventType) =>
    !!saved[event] &&
    JSON.stringify(currentDraft(event)) !== JSON.stringify(saved[event]);

  const save = async (event: PushEventType) => {
    const rule = currentDraft(event);
    if (event === "session_ending") {
      const m = Number(minutesText);
      if (!Number.isInteger(m) || m < 1 || m > 120) {
        setNotes((n) => ({
          ...n,
          [event]: "Minutes remaining must be a whole number from 1 to 120.",
        }));
        return;
      }
    }
    if (event === "session_overdue") {
      const m = Number(repeatText);
      if (!Number.isInteger(m) || m < 1 || m > 120) {
        setNotes((n) => ({
          ...n,
          [event]:
            "Reminder frequency must be a whole number from 1 to 120 minutes.",
        }));
        return;
      }
    }
    setSavingEvent(event);
    setNotes((n) => ({ ...n, [event]: "" }));
    const { error: rpcError } = await supabase.rpc(
      "admin_save_notification_rule",
      {
        p_event: event,
        p_enabled: rule.enabled,
        p_employee_scope: rule.employee_scope,
        p_show_child_name: rule.show_child_name,
        p_params: rule.params,
      },
    );
    setSavingEvent(null);
    if (rpcError) {
      setNotes((n) => ({ ...n, [event]: rpcError.message }));
      return;
    }
    setNotes((n) => ({ ...n, [event]: "Saved." }));
    await load();
  };

  const sendBroadcastTest = async (event: PushEventType) => {
    setBroadcasting(event);
    setBroadcastNotes((n) => ({ ...n, [event]: "" }));
    try {
      const res = await fetch("/api/push/broadcast-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        sent?: number;
        total?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) {
        setBroadcastNotes((n) => ({
          ...n,
          [event]: data.error ?? "That test couldn't be sent.",
        }));
      } else if (!data.total) {
        setBroadcastNotes((n) => ({
          ...n,
          [event]:
            "Nobody is currently eligible for this — turn it on for at least one device first.",
        }));
      } else {
        setBroadcastNotes((n) => ({
          ...n,
          [event]: `Sent to ${data.sent} of ${data.total} eligible device${data.total === 1 ? "" : "s"}${data.failed ? ` — ${data.failed} didn't go through` : ""}.`,
        }));
      }
    } catch {
      setBroadcastNotes((n) => ({
        ...n,
        [event]: "Couldn't reach the server.",
      }));
    }
    setBroadcasting(null);
  };

  if (loading) {
    return (
      <div className="bg-brand-nightSurface rounded-xl2 shadow-sm p-5 text-sm text-brand-nightText/50">
        Loading notification rules…
      </div>
    );
  }

  const employees = people.filter((p) => p.role !== "admin");
  const employeesWithDevice = employees.filter((p) => p.device_count > 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-brand-nightText">Notification rules</p>
        <p className="text-sm text-brand-nightText/50">
          Choose what triggers a notification and who can receive it. Everyone
          still turns notifications on for their own device.
        </p>
      </div>

      {error && <p className="text-sm text-brand-coral">{error}</p>}

      {PUSH_EVENTS.map((event) => {
        const rule = draft[event];
        if (!rule) return null;
        const meta = PUSH_EVENT_META[event];
        const dirty = isDirty(event);

        return (
          <div
            key={event}
            className="bg-brand-nightSurface rounded-xl2 shadow-sm p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-brand-nightText">
                  {meta.label}
                </p>
                <p className="text-sm text-brand-nightText/50">
                  {meta.description}
                </p>
              </div>
              <Toggle
                checked={rule.enabled}
                onChange={(v) => patch(event, { enabled: v })}
                label={`${meta.label} notifications`}
              />
            </div>

            {rule.enabled && (
              <div className="mt-3 space-y-4 border-t border-white/10 pt-4">
                <div>
                  <p className="text-xs font-semibold text-brand-nightText/50 uppercase tracking-wide mb-2">
                    Who receives it
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {SCOPES.map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => patch(event, { employee_scope: scope })}
                        className={`min-h-[44px] px-3 rounded-xl2 border-2 text-sm font-semibold ${
                          rule.employee_scope === scope
                            ? "border-brand-sky bg-brand-sky/10 text-brand-nightText"
                            : "border-white/15 text-brand-nightText/50"
                        }`}
                      >
                        {EMPLOYEE_SCOPE_LABELS[scope]}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-brand-nightText/40 mt-1">
                    Admins who have turned notifications on always receive it.
                  </p>
                </div>

                {event === "session_ending" && (
                  <label className="block">
                    <span className="text-xs font-semibold text-brand-nightText/50 uppercase tracking-wide">
                      Notify when this many minutes remain
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={120}
                      value={minutesText}
                      onChange={(e) => setMinutesText(e.target.value)}
                      className="mt-1 w-28 min-h-[44px] rounded-xl2 border-2 border-white/15 bg-brand-nightSurface2 text-brand-nightText px-4 text-base"
                    />
                  </label>
                )}

                {event === "session_overdue" && (
                  <label className="block">
                    <span className="text-xs font-semibold text-brand-nightText/50 uppercase tracking-wide">
                      Remind again every this many minutes, until checked out
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={120}
                      value={repeatText}
                      onChange={(e) => setRepeatText(e.target.value)}
                      className="mt-1 w-28 min-h-[44px] rounded-xl2 border-2 border-white/15 bg-brand-nightSurface2 text-brand-nightText px-4 text-base"
                    />
                  </label>
                )}

                {event === "child_checkin" && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-brand-nightText">
                      Include which staff are on site
                    </p>
                    <Toggle
                      checked={rule.params.include_staff_on_site !== false}
                      onChange={(v) =>
                        patchParam(event, "include_staff_on_site", v)
                      }
                      label="Include staff on site"
                    />
                  </div>
                )}

                {event === "staff_punch_out" && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-brand-nightText">
                      Also notify for automatic end-of-day punch-outs
                    </p>
                    <Toggle
                      checked={rule.params.include_auto === true}
                      onChange={(v) => patchParam(event, "include_auto", v)}
                      label="Include automatic punch-outs"
                    />
                  </div>
                )}

                {CHILD_EVENTS.includes(event) && (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-brand-nightText">
                        Show the child&apos;s name
                      </p>
                      <p className="text-xs text-brand-nightText/40">
                        Names appear on locked screens. Off shows a generic
                        message instead.
                      </p>
                    </div>
                    <Toggle
                      checked={rule.show_child_name}
                      onChange={(v) => patch(event, { show_child_name: v })}
                      label="Show child's name"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => save(event)}
                disabled={!dirty || savingEvent === event}
                className="min-h-[44px] px-5 rounded-xl2 bg-brand-sky text-white font-semibold disabled:opacity-40"
              >
                {savingEvent === event ? "Saving…" : "Save"}
              </button>
              {notes[event] && (
                <p
                  className={`text-sm ${
                    notes[event] === "Saved."
                      ? "text-brand-leaf"
                      : "text-brand-coral"
                  }`}
                >
                  {notes[event]}
                </p>
              )}
              {rule.enabled && (
                <button
                  type="button"
                  onClick={() => sendBroadcastTest(event)}
                  disabled={broadcasting === event}
                  className="min-h-[44px] px-4 rounded-xl2 border-2 border-white/15 text-brand-nightText/70 hover:border-brand-sky/50 hover:text-brand-nightText text-sm font-semibold transition-colors disabled:opacity-40"
                >
                  {broadcasting === event
                    ? "Sending…"
                    : "Test with everyone eligible"}
                </button>
              )}
            </div>
            {broadcastNotes[event] && (
              <p className="mt-2 text-xs text-brand-nightText/50">
                {broadcastNotes[event]}
              </p>
            )}
          </div>
        );
      })}

      <div className="bg-brand-nightSurface rounded-xl2 shadow-sm p-5">
        <p className="font-semibold text-brand-nightText mb-1">
          Who has notifications set up
        </p>
        <p className="text-sm text-brand-nightText/50 mb-3">
          {employeesWithDevice.length} of {employees.length} employees have
          notifications on at least one device.
        </p>
        <div className="divide-y divide-white/10">
          {people.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-brand-nightText truncate">
                  {p.name}
                  {p.role === "admin" && (
                    <span className="ml-2 text-xs text-brand-nightText/40">
                      admin
                    </span>
                  )}
                </p>
              </div>
              <p
                className={`text-xs shrink-0 ${
                  p.device_count > 0
                    ? "text-brand-leaf"
                    : "text-brand-nightText/40"
                }`}
              >
                {p.device_count > 0
                  ? `${p.device_count} device${p.device_count > 1 ? "s" : ""} · ${p.events.length} alert${p.events.length === 1 ? "" : "s"}`
                  : "Not set up"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
