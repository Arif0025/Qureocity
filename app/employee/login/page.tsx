"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EmployeeLoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });
    if (signInError) {
      setLoading(false);
      return setError(signInError.message);
    }

    const { data: employee } = await supabase
      .from("employees")
      .select("role")
      .eq("id", signInData.user.id)
      .single();

    setLoading(false);

    if (!employee) {
      setError("This account is not registered as an employee.");
      return;
    }

    router.replace(employee.role === "admin" ? "/admin" : "/employee");
  };

  return (
    <div className="min-h-screen bg-brand-cloud flex items-center justify-center px-4">
      <div className="bg-white rounded-xl2 shadow-sm p-8 w-full max-w-sm">
        <img
          src="/logo-full.png"
          alt="QureoCity"
          className="h-12 mx-auto mb-6"
        />
        <h1 className="text-xl font-bold text-brand-ink mb-6 text-center">
          Employee login
        </h1>
        {error && <p className="text-brand-coral text-sm mb-3">{error}</p>}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full min-h-[56px] rounded-xl2 border-2 border-brand-ink/10 px-4 mb-3 text-lg"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full min-h-[56px] rounded-xl2 border-2 border-brand-ink/10 px-4 mb-6 text-lg"
        />
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full min-h-[56px] rounded-xl2 bg-brand-sky text-white font-bold text-lg disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
