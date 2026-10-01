"use client";

import { useEffect, useState } from "react";
import {
  listKioskSessions,
  revokeKioskSession,
  setKioskPassword,
} from "@/app/admin/actions";

type Session = {
  id: string;
  name: string;
  created_at: string;
  last_seen_at: string;
};

export default function KioskAccessCard() {
  const [password, setPassword] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const result = await listKioskSessions();
    if (result.sessions) setSessions(result.sessions);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function savePassword() {
    const result = await setKioskPassword(password);
    setMessage(
      result.error ?? "Password saved. Existing kiosks were signed out.",
    );
    if (!result.error) {
      setPassword("");
      setSessions([]);
    }
  }

  async function revoke(id: string) {
    const result = await revokeKioskSession(id);
    if (result.error) setMessage(result.error);
    await refresh();
  }

  return (
    <div className="bg-brand-nightSurface rounded-xl2 shadow-sm p-5">
      <p className="font-semibold text-brand-nightText mb-1">
        Desk kiosk access
      </p>
      <p className="text-sm text-brand-nightText/50 mb-4">
        Set the password used to unlock <code>/desk</code>, then remove
        individual kiosk browsers whenever needed.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="New password"
          className="min-w-0 flex-1 rounded-xl2 border border-white/15 bg-brand-nightSurface2 text-brand-nightText px-3"
        />
        <button
          type="button"
          onClick={savePassword}
          disabled={password.length < 8}
          className="rounded-xl2 bg-brand-sky px-4 font-semibold text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
      {message && (
        <p className="text-xs text-brand-nightText/60 mt-3">{message}</p>
      )}
      <div className="mt-5 space-y-2">
        {sessions.length === 0 ? (
          <p className="text-sm text-brand-nightText/40">
            No active kiosk access.
          </p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between gap-3 border-t border-white/8 pt-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-brand-nightText truncate">
                  {session.name}
                </p>
                <p className="text-xs text-brand-nightText/40">
                  Last active {new Date(session.last_seen_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(session.id)}
                className="shrink-0 text-xs font-semibold text-brand-coral"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
