"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PunchInFlow from "./PunchInFlow";
import QuickCheckin from "./QuickCheckin";
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
        <div className="bg-white/70 rounded-xl2 border border-black/5 p-3 text-sm max-w-sm mx-auto text-left">
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

const TAB_META = [
  { id: "punch", label: "Punch" },
  { id: "quickcheckin", label: "Quick Check-In" },
  { id: "floor", label: "On Site" },
  { id: "search", label: "Search" },
  { id: "shifts", label: "My Shift" },
] as const;

type Tab = (typeof TAB_META)[number]["id"];

export default function EmployeePanel({
  employeeName,
  initialSessions,
  myShift,
}: {
  employeeName: string;
  initialSessions: SessionRow[];
  myShift: Shift | null;
}) {
  const [tab, setTab] = useState<Tab>("punch");
  const supabase = createClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/employee/login");
  };

  const renderActiveTab = () => {
    switch (tab) {
      case "quickcheckin":
        return <QuickCheckin key="quickcheckin" />;
      case "floor":
        return <LiveFloorView key="floor" initialSessions={initialSessions} />;
      case "shifts":
        return <MyShift key="shifts" shift={myShift} />;
      case "search":
        return <CustomerSearch key="search" isAdmin={false} />;
      case "punch":
      default:
        return <PunchInFlow key="punch" />;
    }
  };

  return (
    <div className="min-h-screen bg-brand-cloud">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
        {/* Header: greeting + sign out, so the top of the screen isn't
            just a floating logo with nothing else going on */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Image
              src="/logo-full.png"
              alt="QureoCity"
              width={132}
              height={48}
              className="h-8 w-auto"
              priority
            />
            <div>
              <p className="text-xs text-brand-ink/40 leading-none">Welcome</p>
              <p className="font-bold text-brand-ink leading-tight">
                {employeeName}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-brand-ink/40 hover:text-brand-coral font-medium"
          >
            Sign out
          </button>
        </div>

        {/* Quick-glance chips so the screen has something to look at
            before you even pick a tab */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-xl2 border border-black/5 px-4 py-3">
            <p className="text-xs text-brand-ink/40">Kids on site</p>
            <p className="text-2xl font-extrabold text-brand-ink">
              {initialSessions.length}
            </p>
          </div>
          <div className="bg-white rounded-xl2 border border-black/5 px-4 py-3">
            <p className="text-xs text-brand-ink/40">Your shift</p>
            <p className="text-lg font-extrabold text-brand-ink">
              {myShift
                ? `${myShift.start_time.slice(0, 5)}–${myShift.end_time.slice(0, 5)}`
                : "—"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1 mb-6 bg-white rounded-2xl p-1 border border-black/5 shadow-sm">
          {TAB_META.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-center min-h-[52px] rounded-xl px-2 text-[11px] md:text-xs font-semibold tracking-wide transition-colors ${
                tab === t.id
                  ? "bg-brand-sky text-white shadow-sm"
                  : "text-brand-ink/50 hover:text-brand-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {renderActiveTab()}
      </div>
    </div>
  );
}
