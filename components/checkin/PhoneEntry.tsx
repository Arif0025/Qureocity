"use client";

import { useState, useEffect, useRef } from "react";

export default function PhoneEntry({
  onSubmit,
  loading,
}: {
  onSubmit: (phone: string) => void;
  loading: boolean;
}) {
  const [digits, setDigits] = useState("");
  const submittedRef = useRef(false);

  // Auto-advance the moment a valid 10-digit number is entered — no
  // "submit" tap needed, which is where most of the felt speed comes
  // from at a front desk with a line of parents behind you.
  useEffect(() => {
    if (digits.length === 10 && !submittedRef.current) {
      submittedRef.current = true;
      onSubmit(digits);
    }
    if (digits.length < 10) {
      submittedRef.current = false;
    }
  }, [digits, onSubmit]);

  return (
    <div className="bg-white rounded-xl2 shadow-sm p-8 text-center">
      <h1 className="text-2xl font-bold text-brand-ink mb-1">Welcome to QureoCity</h1>
      <p className="text-brand-ink/60 mb-6">Enter your phone number to check in</p>

      <input
        type="tel"
        inputMode="numeric"
        autoFocus
        maxLength={10}
        value={digits}
        onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 10))}
        placeholder="10-digit number"
        className="w-full text-center text-3xl tracking-widest font-semibold py-5 rounded-xl2 border-2 border-brand-sky/30 focus:border-brand-sky focus:outline-none min-h-[64px]"
        disabled={loading}
      />

      <div className="mt-4 h-6 flex items-center justify-center">
        {loading && (
          <span className="text-brand-sky text-sm font-medium animate-pulse">
            Looking you up…
          </span>
        )}
        {!loading && digits.length > 0 && digits.length < 10 && (
          <span className="text-brand-ink/40 text-sm">{10 - digits.length} more digit{10 - digits.length === 1 ? "" : "s"}</span>
        )}
      </div>
    </div>
  );
}
