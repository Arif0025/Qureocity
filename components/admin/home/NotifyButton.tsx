"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Clock, MessageSquare, Send, AlarmClock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomSheet from "@/components/ui/BottomSheet";
import { tapScale } from "@/lib/motion";

type OverdueChild = {
  session_id: string;
  child_name: string;
  minutes_overdue: number;
};

type View = "menu" | "overtime" | "custom";

// A direct nudge to one staff member — not the automated alert system,
// a one-tap "hey" from an admin who's looking at this person's row
// right now. Always reaches every device they have registered,
// regardless of their own notification toggles (see the manual-notify
// route for why that's intentional here).
export default function NotifyButton({
  employeeId,
  employeeName,
  initialOpen = false,
}: {
  employeeId: string;
  employeeName: string;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [view, setView] = useState<View>("menu");
  const [overdue, setOverdue] = useState<OverdueChild[] | null>(null);
  const [customText, setCustomText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const reset = () => {
    setView("menu");
    setResult(null);
    setCustomText("");
  };

  const send = async (title: string, message: string) => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/push/manual-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, title, message }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        sent?: number;
        error?: string;
      };
      if (!res.ok) {
        setResult(data.error ?? "That didn't go through.");
      } else {
        setResult(`Sent to ${data.sent} device${data.sent === 1 ? "" : "s"}.`);
      }
    } catch {
      setResult("Couldn't reach the server.");
    }
    setSending(false);
  };

  const openOvertime = async () => {
    setView("overtime");
    if (overdue !== null) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("admin_list_overdue_sessions");
    setOverdue((data as OverdueChild[]) ?? []);
  };

  return (
    <>
      <motion.button
        type="button"
        whileTap={tapScale}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
          reset();
          setOverdue(null);
        }}
        aria-label={`Notify ${employeeName}`}
        className="flex items-center gap-1 text-[11px] font-semibold text-brand-sun bg-brand-sun/10 border border-brand-sun/30 px-2 py-1 rounded-full hover:bg-brand-sun/15 transition-colors"
      >
        <Bell size={11} />
        Notify
      </motion.button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Notify ${employeeName}`}
      >
        {view === "menu" && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={openOvertime}
              className="w-full flex items-center gap-3 min-h-[52px] px-4 rounded-xl2 border border-white/10 bg-brand-nightSurface2 hover:border-brand-sky/40 transition-colors text-left"
            >
              <AlarmClock size={16} className="text-brand-coral shrink-0" />
              <span className="text-sm font-semibold text-brand-nightText">
                A child&apos;s overtime
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                send(
                  "Attendance reminder",
                  `Hi ${employeeName}, quick reminder to punch in on time today.`,
                )
              }
              disabled={sending}
              className="w-full flex items-center gap-3 min-h-[52px] px-4 rounded-xl2 border border-white/10 bg-brand-nightSurface2 hover:border-brand-sky/40 transition-colors text-left disabled:opacity-50"
            >
              <Clock size={16} className="text-brand-sky shrink-0" />
              <span className="text-sm font-semibold text-brand-nightText">
                Punched in late
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                send(
                  "Attendance reminder",
                  `Hi ${employeeName}, noticed an early punch-out today — please remember to complete your full shift or let an admin know in advance.`,
                )
              }
              disabled={sending}
              className="w-full flex items-center gap-3 min-h-[52px] px-4 rounded-xl2 border border-white/10 bg-brand-nightSurface2 hover:border-brand-sky/40 transition-colors text-left disabled:opacity-50"
            >
              <Clock size={16} className="text-brand-sky shrink-0" />
              <span className="text-sm font-semibold text-brand-nightText">
                Punched out early
              </span>
            </button>
            <button
              type="button"
              onClick={() => setView("custom")}
              className="w-full flex items-center gap-3 min-h-[52px] px-4 rounded-xl2 border border-white/10 bg-brand-nightSurface2 hover:border-brand-sky/40 transition-colors text-left"
            >
              <MessageSquare size={16} className="text-brand-leaf shrink-0" />
              <span className="text-sm font-semibold text-brand-nightText">
                Custom message
              </span>
            </button>
          </div>
        )}

        {view === "overtime" && (
          <div className="space-y-2">
            {overdue === null ? (
              <p className="text-sm text-brand-nightText/40 py-4">Checking…</p>
            ) : overdue.length === 0 ? (
              <p className="text-sm text-brand-nightText/40 py-4">
                Nobody&apos;s currently over their session time.
              </p>
            ) : (
              overdue.map((c) => (
                <button
                  key={c.session_id}
                  type="button"
                  disabled={sending}
                  onClick={() =>
                    send(
                      "Please check a child out",
                      `Hi ${employeeName}, ${c.child_name}'s session ended ${c.minutes_overdue} min ago and they're still showing as checked in — please check on them when you get a moment.`,
                    )
                  }
                  className="w-full flex items-center justify-between gap-3 min-h-[48px] px-4 rounded-xl2 border border-white/10 bg-brand-nightSurface2 hover:border-brand-coral/40 transition-colors text-left disabled:opacity-50"
                >
                  <span className="text-sm font-semibold text-brand-nightText">
                    {c.child_name}
                  </span>
                  <span className="text-xs text-brand-coral shrink-0">
                    {c.minutes_overdue} min over
                  </span>
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => setView("menu")}
              className="text-xs font-semibold text-brand-nightText/40 hover:text-brand-nightText pt-1"
            >
              ← Back
            </button>
          </div>
        )}

        {view === "custom" && (
          <div>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={4}
              autoFocus
              placeholder={`Message for ${employeeName}…`}
              className="w-full rounded-xl2 border-2 border-white/15 bg-brand-nightSurface2 text-brand-nightText p-3 text-sm resize-none"
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => setView("menu")}
                className="min-h-[44px] px-4 rounded-xl2 border border-white/15 text-brand-nightText/60 text-sm font-semibold"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => send("Message from admin", customText.trim())}
                disabled={sending || !customText.trim()}
                className="flex-1 min-h-[44px] rounded-xl2 bg-brand-sky text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Send size={15} />
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        )}

        {result && (
          <p className="text-sm text-brand-nightText/60 mt-3 pt-3 border-t border-white/10">
            {result}
          </p>
        )}
      </BottomSheet>
    </>
  );
}
