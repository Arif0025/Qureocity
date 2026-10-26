import { randomUUID } from "@/lib/randomId";

// A random, non-identifying per-device id used purely to bucket rate
// limiting (see check_rate_limit in the SQL migration). Not tied to any
// personal data, so it doesn't need consent banners — it's the
// equivalent of a session nonce, not tracking.
//
// Must never throw: it runs inside check-in click handlers, and some
// browsers block localStorage (private mode, locked-down kiosks) or lack
// crypto.randomUUID. In those cases we fall back to an in-memory key for
// the life of the page.
let memoryKey: string | null = null;

export function getClientKey(): string {
  const KEY = "qc_client_key";
  if (typeof window === "undefined") return "server";

  try {
    let key = window.localStorage.getItem(KEY);
    if (!key) {
      key = randomUUID();
      window.localStorage.setItem(KEY, key);
    }
    return key;
  } catch {
    if (!memoryKey) {
      try {
        memoryKey = randomUUID();
      } catch {
        memoryKey = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      }
    }
    return memoryKey;
  }
}
