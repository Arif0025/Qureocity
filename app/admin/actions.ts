"use server";

import {
  createServerSupabase,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import {
  hashKioskPassword,
  hashToken,
  KIOSK_COOKIE,
  verifyKioskPassword,
} from "@/lib/kioskAuth";

// NOTE: these return { error } instead of throwing. Next.js redacts
// thrown Server Action errors down to a generic "digest" message in
// production for security — fine for truly unexpected crashes, but it
// was hiding perfectly normal validation messages (like "email already
// registered") from the admin. Returning the error as data means it
// reaches the UI intact.

export async function createEmployee(input: {
  name: string;
  email: string;
  temporaryPassword: string;
  role: "staff" | "admin";
}): Promise<{ id?: string; error?: string }> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: caller } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    return { error: "Only admins can add employees." };
  }

  const admin = createServiceRoleClient();

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: input.temporaryPassword,
      email_confirm: true,
    });
  if (createError) return { error: createError.message };

  const { error: insertError } = await admin.from("employees").insert({
    id: created.user.id,
    name: input.name,
    role: input.role,
  });
  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: insertError.message };
  }

  return { id: created.user.id };
}

export async function resetEmployeePassword(
  employeeId: string,
): Promise<{ newTemporaryPassword?: string; error?: string }> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: caller } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    return { error: "Only admins can reset passwords." };
  }

  const admin = createServiceRoleClient();
  const newTemporaryPassword = crypto.randomUUID().slice(0, 12);

  const { error } = await admin.auth.admin.updateUserById(employeeId, {
    password: newTemporaryPassword,
  });
  if (error) return { error: error.message };

  return { newTemporaryPassword };
}

export async function removeEmployee(
  employeeId: string,
): Promise<{ error?: string }> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: caller } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    return { error: "Only admins can remove employees." };
  }

  const admin = createServiceRoleClient();

  const { error: authError } = await admin.auth.admin.deleteUser(employeeId);
  if (authError && authError.message !== "User not found") {
    return { error: authError.message };
  }

  const { error: deleteError } = await admin
    .from("employees")
    .delete()
    .eq("id", employeeId);
  if (deleteError) return { error: deleteError.message };

  return {};
}

export async function setQrMode(
  mode: "static" | "dynamic",
): Promise<{ error?: string }> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: caller } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    return { error: "Only admins can change the QR mode." };
  }

  const { error } = await supabase
    .from("app_settings")
    .update({ qr_mode: mode })
    .eq("id", true);
  if (error) return { error: error.message };

  return {};
}

async function requireAdmin() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." } as const;

  const { data: caller } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();
  if (caller?.role !== "admin")
    return { error: "Only admins can manage kiosk access." } as const;
  return { supabase } as const;
}

export async function setKioskPassword(
  password: string,
): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  if (password.length < 8) return { error: "Use at least 8 characters." };

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("app_settings")
    .update({ kiosk_password_hash: hashKioskPassword(password) })
    .eq("id", true);
  if (error) return { error: error.message };

  await admin
    .from("kiosk_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .is("revoked_at", null);
  return {};
}

export async function listKioskSessions(): Promise<{
  sessions?: {
    id: string;
    name: string;
    created_at: string;
    last_seen_at: string;
  }[];
  error?: string;
}> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("kiosk_sessions")
    .select("id, name, created_at, last_seen_at")
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });
  if (error) return { error: error.message };
  return { sessions: data ?? [] };
}

export async function revokeKioskSession(
  sessionId: string,
): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  const { error } = await createServiceRoleClient()
    .from("kiosk_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sessionId);
  return error ? { error: error.message } : {};
}

export async function loginKiosk(
  name: string,
  password: string,
): Promise<{ error?: string }> {
  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Enter a kiosk name." };

  const admin = createServiceRoleClient();
  const { data: settings } = await admin
    .from("app_settings")
    .select("kiosk_password_hash")
    .eq("id", true)
    .single();
  if (
    !settings?.kiosk_password_hash ||
    !verifyKioskPassword(password, settings.kiosk_password_hash)
  ) {
    return { error: "That password is not correct." };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const { error } = await admin.from("kiosk_sessions").insert({
    name: trimmedName.slice(0, 80),
    token_hash: hashToken(token),
  });
  if (error)
    return { error: "Unable to start kiosk access. Please try again." };

  cookies().set(KIOSK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/desk",
    maxAge: 60 * 60 * 24 * 365,
  });
  return {};
}
