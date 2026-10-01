"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginKiosk } from "@/app/admin/actions";

export default function KioskLogin() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await loginKiosk(name, password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-brand-cloud flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl2 shadow-lg p-8 w-full max-w-sm"
      >
        <img
          src="/logo-full.png"
          alt="QureoCity"
          className="h-14 mx-auto mb-6"
        />
        <h1 className="text-xl font-bold text-brand-ink text-center">
          Desk kiosk login
        </h1>
        <p className="text-sm text-brand-ink/50 text-center mt-2 mb-6">
          Use the kiosk password from Admin Settings.
        </p>
        {error && (
          <p role="alert" className="text-brand-coral text-sm mb-3">
            {error}
          </p>
        )}
        <div className="space-y-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Kiosk name"
            autoComplete="off"
            required
            className="w-full min-h-[52px] rounded-xl2 border-2 border-brand-ink/10 px-4"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Kiosk password"
            autoComplete="current-password"
            required
            className="w-full min-h-[52px] rounded-xl2 border-2 border-brand-ink/10 px-4"
          />
          <button
            disabled={loading}
            className="w-full min-h-[52px] rounded-xl2 bg-brand-sky text-white font-bold disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Open desk"}
          </button>
        </div>
      </form>
    </main>
  );
}
