"use server";

import {
  createServerSupabase,
  createServiceRoleClient,
} from "@/lib/supabase/server";

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
