"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginEmployee } from "./actions";

export default function EmployeeLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);
    const result = await loginEmployee(email, password);

    if (result.error || !result.destination) {
      setLoading(false);
      setError(result.error ?? "Unable to sign in. Please try again.");
      return;
    }

    router.replace(result.destination);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-brand-cloud flex items-center justify-center px-4">
      <div className="bg-white rounded-xl2 shadow-sm p-8 w-full max-w-sm">
        <img src="/logo-full.png" alt="QureoCity" className="h-12 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-brand-ink mb-2 text-center">Employee login</h1>
        <p className="text-sm text-brand-ink/50 mb-6 text-center">Use your staff account to continue.</p>
        {error && <p role="alert" className="text-brand-coral text-sm mb-3">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-3">
          <label className="block">
            <span className="sr-only">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              required
              disabled={loading}
              className="w-full min-h-[56px] rounded-xl2 border-2 border-brand-ink/10 px-4 text-lg disabled:bg-black/[0.02]"
            />
          </label>
          <label className="block">
            <span className="sr-only">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
              disabled={loading}
              className="w-full min-h-[56px] rounded-xl2 border-2 border-brand-ink/10 px-4 text-lg disabled:bg-black/[0.02]"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[56px] rounded-xl2 bg-brand-sky text-white font-bold text-lg disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
