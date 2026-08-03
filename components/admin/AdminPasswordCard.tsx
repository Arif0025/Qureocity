"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AdminPasswordCard() {
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
    <div className="bg-brand-nightSurface rounded-xl2 shadow-sm p-5">
      <p className="font-semibold text-brand-nightText mb-1">Password</p>
      <p className="text-sm text-brand-nightText/50 mb-4">
        Change the password for your admin account after you sign in.
      </p>

      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="min-h-[40px] px-4 rounded-lg bg-brand-sky text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Change password
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="w-full min-h-[44px] rounded-xl2 border-2 border-white/15 bg-brand-nightSurface2 text-brand-nightText px-4 text-base"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className="w-full min-h-[44px] rounded-xl2 border-2 border-white/15 bg-brand-nightSurface2 text-brand-nightText px-4 text-base"
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
              className="min-h-[36px] rounded-xl2 bg-white/8 px-3 py-2 text-sm font-semibold text-brand-nightText"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-brand-coral text-sm">{error}</p>}
          {message && <p className="text-brand-leaf text-sm">{message}</p>}
        </form>
      )}
    </div>
  );
}
