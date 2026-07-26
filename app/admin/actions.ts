"use server";

import { createServerSupabase, createServiceRoleClient } from "@/lib/supabase/server";

export async function createEmployee(input: {
  name: string;
  email: string;
  temporaryPassword: string;
  role: "staff" | "admin";
}) {
  // Re-verify on the server that the caller is an admin, even though the
  // UI already hid this control from non-admins — the client can't be
  // trusted to enforce this by itself.
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  const { data: caller } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    throw new Error("Only admins can add employees.");
  }

  // Only now do we touch the service_role client — never exposed to the
  // browser, only ever invoked from this server-only action file.
  const admin = createServiceRoleClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.temporaryPassword,
    email_confirm: true,
  });
  if (createError) throw new Error(createError.message);

  const { error: insertError } = await admin.from("employees").insert({
    id: created.user.id,
    name: input.name,
    role: input.role,
  });
  if (insertError) throw new Error(insertError.message);

  return { id: created.user.id };
}

// Completes the "accounts created by Admin only" model: since employees
// have no self-serve forgot-password flow, an admin needs a working way
// to reset one. Same guard pattern as createEmployee — re-check admin
// status server-side, only then touch the service_role client.
export async function resetEmployeePassword(employeeId: string) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  const { data: caller } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    throw new Error("Only admins can reset passwords.");
  }

  const admin = createServiceRoleClient();
  const newTemporaryPassword = crypto.randomUUID().slice(0, 12);

  const { error } = await admin.auth.admin.updateUserById(employeeId, {
    password: newTemporaryPassword,
  });
  if (error) throw new Error(error.message);

  return { newTemporaryPassword };
}

// Toggles the front-desk QR between "static" (current, printed/fixed
// code) and "dynamic" (rotating signed token — stubbed for now, see
// components/desk/DeskQrDisplay.tsx). No service_role needed here: this
// is a plain table update, authorized by the "admin can update qr mode"
// RLS policy on app_settings — the double-check below is just so the
// error message is clear rather than a generic RLS-denial.
export async function setQrMode(mode: "static" | "dynamic") {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  const { data: caller } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    throw new Error("Only admins can change the QR mode.");
  }

  const { error } = await supabase.from("app_settings").update({ qr_mode: mode }).eq("id", true);
  if (error) throw new Error(error.message);
}
