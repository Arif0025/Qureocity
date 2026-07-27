"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PunchInFlow from "./PunchInFlow";
import LiveFloorView from "@/components/admin/LiveFloorView";
import CustomerSearch from "@/components/shared/CustomerSearch";

type SessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  children: { name: string; customers: { name: string } | null } | null;
};

type Shift = {
  id: string;
  start_time: string;
  end_time: string;
  notes: string | null;
};

function MyShift({ shift }: { shift: Shift | null }) {
  if (!shift) {
    return (
      <div className="bg-white rounded-xl2 shadow-sm p-8 text-center text-brand-ink/40">
        No shift assigned yet — check with an admin.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl2 shadow-sm p-8 text-center">
      <p className="text-brand-ink/50 text-sm mb-1">Your shift</p>
      <p className="text-3xl font-extrabold text-brand-ink mb-1">
        {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
      </p>
      <p className="text-xs text-brand-ink/40 mb-2">
        Every day, until changed by an admin
      </p>
      {shift.notes && (
        <p className="text-sm text-brand-ink/60 mt-3">{shift.notes}</p>
      )}
      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const supabase = createClient();
  const [isOpen, setIsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Your password was updated successfully.");
    setNewPassword("");
    setConfirmPassword("");
    setIsOpen(false);
  };

  return (
    <div className="mt-4">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="text-xs font-medium text-brand-ink/50 hover:text-brand-sky transition-colors"
        >
          Change password
        </button>
      ) : (
        <div className="bg-white/70 rounded-xl2 border border-black/5 p-3 text-sm max-w-sm">
          <p className="font-semibold text-brand-ink mb-1">Change password</p>
          <p className="text-brand-ink/50 mb-3">
            Update the password for your own account only.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full min-h-[44px] rounded-xl2 border-2 border-black/10 px-4 text-base"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full min-h-[44px] rounded-xl2 border-2 border-black/10 px-4 text-base"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="min-h-[36px] rounded-xl2 bg-brand-sky px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setError(null);
                  setMessage(null);
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                className="min-h-[36px] rounded-xl2 bg-black/5 px-3 py-2 text-sm font-semibold text-brand-ink"
              >
                Cancel
              </button>
            </div>
          </form>
          {error && <p className="text-brand-coral text-sm mt-3">{error}</p>}
          {message && <p className="text-brand-leaf text-sm mt-3">{message}</p>}
        </div>
      )}
    </div>
  );
}

export default function EmployeePanel({
  initialSessions,
  myShift,
}: {
  initialSessions: SessionRow[];
  myShift: Shift | null;
}) {
  const [tab, setTab] = useState<"punch" | "floor" | "shifts" | "search">(
    "punch",
  );

  const renderActiveTab = () => {
    switch (tab) {
      case "floor":
        return <LiveFloorView key="floor" initialSessions={initialSessions} />;
      case "shifts":
        return <MyShift key="shifts" shift={myShift} />;
      case "search":
        return <CustomerSearch key="search" />;
      case "punch":
      default:
        return <PunchInFlow key="punch" />;
    }
  };

  return (
    <div className="min-h-screen bg-brand-cloud">
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-10">
        <img
          src="/logo-full.png"
          alt="QureoCity"
          className="h-12 mx-auto mb-6"
        />

        <div className="flex gap-1 mb-4 bg-white rounded-full p-1 border border-black/5 max-w-md mx-auto text-sm">
          <button
            type="button"
            onClick={() => setTab("punch")}
            className={`flex-1 min-h-[40px] rounded-full font-semibold transition-colors ${
              tab === "punch" ? "bg-brand-sky text-white" : "text-brand-ink/50"
            }`}
          >
            Punch In/Out
          </button>
          <button
            type="button"
            onClick={() => setTab("floor")}
            className={`flex-1 min-h-[40px] rounded-full font-semibold transition-colors ${
              tab === "floor" ? "bg-brand-sky text-white" : "text-brand-ink/50"
            }`}
          >
            Kids on site ({initialSessions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("shifts")}
            className={`flex-1 min-h-[40px] rounded-full font-semibold transition-colors ${
              tab === "shifts" ? "bg-brand-sky text-white" : "text-brand-ink/50"
            }`}
          >
            My Shift
          </button>
          <button
            type="button"
            onClick={() => setTab("search")}
            className={`flex-1 min-h-[40px] rounded-full font-semibold transition-colors ${
              tab === "search" ? "bg-brand-sky text-white" : "text-brand-ink/50"
            }`}
          >
            Search
          </button>
        </div>

        {renderActiveTab()}
      </div>
    </div>
  );
}
