"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PUSH_EVENT_META, type PushEventType } from "@/lib/push/events";

type LogRow = {
  event_type: string;
  is_test: boolean;
  person: string;
  device: string;
  result: "sent" | "failed" | "gone";
  created_at: string;
};

const RESULT_LABEL: Record<LogRow["result"], string> = {
  sent: "Delivered",
  failed: "Failed",
  gone: "Device unreachable",
};
const RESULT_COLOR: Record<LogRow["result"], string> = {
  sent: "text-brand-leaf",
  failed: "text-brand-coral",
  gone: "text-brand-nightText/40",
};

function eventLabel(eventType: string): string {
  if (eventType === "manual_test") return "Manual test";
  return PUSH_EVENT_META[eventType as PushEventType]?.label ?? eventType;
}

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

// The "stop guessing, go look" view — every send attempt the server has
// made recently, who it was for, which device, and whether it actually
// went through. Read directly from push_send_log via 0075.
export default function PushDeliveryLog() {
  const supabase = createClient();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc(
      "admin_recent_push_sends",
      { p_limit: 40 },
    );
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setError(null);
      setRows(data as LogRow[]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-brand-nightSurface rounded-xl2 shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="font-semibold text-brand-nightText">Recent sends</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh"
          className="text-brand-nightText/40 hover:text-brand-nightText p-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="text-sm text-brand-nightText/50 mb-3">
        What was actually sent, to whom, and whether it went through — real
        events and test sends both show up here.
      </p>

      {error && <p className="text-sm text-brand-coral">{error}</p>}

      {rows && rows.length === 0 && (
        <p className="text-sm text-brand-nightText/40">
          Nothing has been sent yet.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="divide-y divide-white/8 -mx-1">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 px-1 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-brand-nightText truncate">
                  {eventLabel(r.event_type)}
                  {r.is_test && (
                    <span className="ml-1.5 text-[11px] text-brand-nightText/35">
                      test
                    </span>
                  )}
                </p>
                <p className="text-xs text-brand-nightText/40 truncate">
                  {r.person} · {r.device} ·{" "}
                  {timeFmt.format(new Date(r.created_at))}
                </p>
              </div>
              <p
                className={`text-xs font-medium shrink-0 ${RESULT_COLOR[r.result]}`}
              >
                {RESULT_LABEL[r.result]}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
