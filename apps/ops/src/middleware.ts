import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Token refresh.
 *
 * Server Components cannot write cookies, so a session that expires mid-render
 * has nowhere to store its refreshed token — the user gets bounced to /login
 * while actually being signed in. This runs before every request, refreshes if
 * needed, and writes the new cookies onto the response.
 *
 * It deliberately does NOT decide who may see what. Authorization lives in RLS
 * and in requireStaff(); a middleware that gates routes gives a false sense of
 * security, because anything it protects is still reachable by any other path
 * to the data.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Touching the auth state is what triggers the refresh. The result is
  // ignored on purpose — the point is the cookie write above.
  await client.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image files, which never carry a
    // session and would only pay the cost of a refresh check.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
