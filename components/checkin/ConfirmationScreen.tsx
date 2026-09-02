"use client";

import { useEffect, useState } from "react";

function useCountdown(endTime: string | null) {
  const [remaining, setRemaining] = useState<number | null>(
    endTime ? new Date(endTime).getTime() - Date.now() : null,
  );

  useEffect(() => {
    if (!endTime) return;
    const id = setInterval(() => {
      setRemaining(new Date(endTime).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return remaining;
}

function TimerRow({ endTime }: { endTime: string | null }) {
  const remaining = useCountdown(endTime);

  if (remaining === null) {
    return (
      <div className="rounded-xl2 bg-brand-sky/10 px-5 py-4 text-brand-sky font-semibold text-center">
        Unlimited play — no timer
      </div>
    );
  }

  const overdue = remaining < 0;
  const abs = Math.abs(remaining);
  const mins = Math.floor(abs / 60000);
  const secs = Math.floor((abs % 60000) / 1000);

  return (
    <div
      className={`rounded-xl2 px-5 py-4 text-center font-bold text-2xl tabular-nums ${
        overdue
          ? "bg-brand-coral/10 text-brand-coral"
          : "bg-brand-leaf/10 text-brand-leaf"
      }`}
    >
      {overdue ? "Overdue " : ""}
      {mins}:{secs.toString().padStart(2, "0")}
      {overdue ? " over" : " left"}
    </div>
  );
}

export default function ConfirmationScreen({
  sessions,
  onDone,
}: {
  sessions: {
    session_id: string;
    end_time: string | null;
    status?: string;
  }[];
  onDone: () => void;
}) {
  return (
    <div className="bg-white rounded-xl2 shadow-sm p-8 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-leaf/15 flex items-center justify-center text-brand-leaf text-3xl">
        ✓
      </div>
      {sessions.some((session) => session.status === "completed") ? (
        <>
          <h1 className="text-2xl font-bold text-brand-ink mb-1">
            Visit added to records
          </h1>
          <p className="text-brand-ink/60 mb-6">
            Your historical walk-in has been recorded.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-brand-ink mb-1">
            You're checked in!
          </h1>
          <p className="text-brand-ink/60 mb-6">
            Show this screen at the front desk.
          </p>
        </>
      )}

      {sessions.some((session) => session.status !== "completed") && (
        <div className="space-y-3 mb-8">
          {sessions.map((s) => (
            <TimerRow key={s.session_id} endTime={s.end_time} />
          ))}
        </div>
      )}

      <button
        onClick={onDone}
        className="w-full min-h-[56px] rounded-xl2 border-2 border-brand-ink/10 text-brand-ink/60 font-semibold"
      >
        Done
      </button>
    </div>
  );
}
