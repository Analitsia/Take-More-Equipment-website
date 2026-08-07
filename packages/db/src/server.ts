import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.generated";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Server-side clients.
 *
 * Two of them, because the two apps have genuinely different needs: the
 * storefront is anonymous and wants nothing to do with cookies or sessions, and
 * the ops app is a signed-in session that has to be able to refresh its token.
 */

type CookieStore = {
  getAll: () => { name: string; value: string }[];
  set: (name: string, value: string, options?: CookieOptions) => void;
};

/**
 * Annotated rather than inferred. While types.generated.ts is still the `any`
 * stub, `createServerClient<Database>` cannot resolve its generics and the
 * callback parameters silently fall back to implicit `any` — which `strict`
 * rejects. Naming the shape keeps this file honest both before and after
 * `npm run db:types` produces the real schema.
 */
type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * The storefront's reader. Publishable key, no session, no cookies.
 *
 * It can only ever reach the public_* views and the published rows the anon
 * policies allow, so there is nothing here to leak even if a query is wrong.
 * `persistSession: false` matters: without it the client tries to write auth
 * state during a static render.
 */
export const createPublicClient = () =>
  createSupabaseClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/**
 * The ops app's reader/writer, as whoever is signed in.
 *
 * `cookies` comes from next/headers at the call site rather than being imported
 * here, so this package stays framework-agnostic and testable.
 *
 * The setAll try/catch is not laziness. Next.js Server Components cannot write
 * cookies, so a refresh attempted during a render throws; the proxy/middleware
 * is what actually persists the refreshed token, and swallowing the throw here
 * is the documented pattern rather than a swallowed bug.
 */
export const createStaffClient = (cookieStore: CookieStore) =>
  createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component; the proxy will refresh instead.
        }
      },
    },
  });
