// A random, non-identifying per-device id used purely to bucket rate
// limiting (see check_rate_limit in the SQL migration). Not tied to any
// personal data, so it doesn't need consent banners — it's the
// equivalent of a session nonce, not tracking.
export function getClientKey(): string {
  const KEY = "qc_client_key";
  if (typeof window === "undefined") return "server";

  let key = localStorage.getItem(KEY);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(KEY, key);
  }
  return key;
}
