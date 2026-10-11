import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { toWhatsAppDigits } from "@/lib/whatsapp";

type WhatsAppAction = { phone: string; message: string; expiresAt: number };

function encryptionKey(): Buffer {
  const secret = process.env.VAPID_PRIVATE_KEY;
  if (!secret) throw new Error("Push configuration is missing.");
  return createHash("sha256").update(`qureocity-push-whatsapp:${secret}`).digest();
}

export function createWhatsAppActionToken(phone: string, message: string): string {
  const digits = toWhatsAppDigits(phone);
  if (!/^\d{10,15}$/.test(digits)) return "";
  const payload: WhatsAppAction = {
    phone: digits,
    message: message.slice(0, 500),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function readWhatsAppActionToken(token: string): WhatsAppAction | null {
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.length < 29) return null;
    const iv = bytes.subarray(0, 12);
    const authTag = bytes.subarray(12, 28);
    const encrypted = bytes.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const payload = JSON.parse(Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8")) as WhatsAppAction;
    if (!/^\d{10,15}$/.test(payload.phone) || typeof payload.message !== "string" || typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
