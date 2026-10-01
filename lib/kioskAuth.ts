import crypto from "crypto";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const KIOSK_COOKIE = "qureocity_kiosk_session";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashKioskPassword(
  password: string,
  salt = crypto.randomBytes(16).toString("hex"),
) {
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

export function verifyKioskPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex"),
  );
}

export async function getKioskSession() {
  const token = cookies().get(KIOSK_COOKIE)?.value;
  if (!token) return null;

  const admin = createServiceRoleClient();
  const { data: session } = await admin
    .from("kiosk_sessions")
    .select("id, name")
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .single();
  if (!session) return null;

  await admin
    .from("kiosk_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id);
  return session;
}

export { hashToken };
