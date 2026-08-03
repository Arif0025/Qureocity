import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths under the matched prefixes that must stay reachable without a
// session — otherwise a logged-out user could never reach the login page.
const PUBLIC_PATHS = ["/employee/login"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
          headers: Record<string, string>,
        ) {
          // Write to both the incoming request (so this same middleware
          // pass sees the refreshed session) and the outgoing response
          // (so the browser actually persists it).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // @supabase/ssr asks for these Cache-Control/Expires/Pragma
          // headers to be set whenever it writes an auth cookie, so a CDN
          // or edge cache in front of the app can never serve one
          // person's session cookie to someone else.
          Object.entries(headers ?? {}).forEach(([key, val]) =>
            response.headers.set(key, val),
          );
        },
      },
    },
  );

  // Just calling getUser() is what triggers Supabase to refresh an
  // expiring token if needed — and here, in middleware, the resulting
  // cookie write actually sticks (unlike in a Server Component).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublicPath) {
    // This is the actual auth guard: no session + a protected path means
    // the request never reaches page code at all. Each page under
    // /admin and /employee also checks auth itself (role checks live
    // there, since middleware only knows "logged in or not"), but that
    // was previously the *only* enforcement — this closes the gap where
    // a future route could forget its own check and quietly serve to a
    // logged-out visitor.
    const loginUrl = new URL("/employee/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/employee/:path*"],
};
