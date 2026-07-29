"use server";

import { createServerSupabase } from "@/lib/supabase/server";

export type LoginResult = {
  error?: string;
  destination?: "/admin" | "/employee";
};

// A Server Action writes the Supabase session cookie into its response before
// the client navigates to a protected Server Component.
export async function loginEmployee(
  email: string,
  password: string,
): Promise<LoginResult> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Unable to sign in. Please try again." };
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (employeeError || !employee) {
    await supabase.auth.signOut();
    return { error: "This account is not registered as an employee." };
  }

  return { destination: employee.role === "admin" ? "/admin" : "/employee" };
}
