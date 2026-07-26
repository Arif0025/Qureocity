import { createBrowserClient } from "@supabase/ssr";

// Uses ONLY the public anon key. This key relies entirely on the RLS
// policies + RPC design in supabase/migrations/0001_init.sql — it must
// never be granted broader table access as a "quick fix" later, or the
// enumeration vulnerability comes right back.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
