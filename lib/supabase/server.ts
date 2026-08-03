import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Normal server-side client — respects the logged-in employee's session
// and therefore their RLS policies (staff vs admin).
//
// Uses the getAll/setAll cookie interface (the get/set/remove interface
// was deprecated by @supabase/ssr as of v0.6.0 and removed in later
// versions — mixing the two APIs silently breaks session handling).
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Expected when called from a Server Component (which can only
            // read cookies, not write them) — middleware.ts is what
            // actually persists a refreshed session's cookie.
          }
        },
      },
    },
  );
}

// SERVICE ROLE client — bypasses RLS entirely. This must:
//  1. Only ever be imported inside files under app/admin/actions.ts
//     (Server Actions, never shipped to the client bundle).
//  2. Only ever be called after confirming the caller is an
//     authenticated admin (checked via createServerSupabase() first).
//  3. Read its key from SUPABASE_SERVICE_ROLE_KEY — NOT prefixed with
//     NEXT_PUBLIC_, so Next.js never bundles it into client JS.
export function createServiceRoleClient() {
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
