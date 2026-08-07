import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.generated";
import { supabaseSecretKey, supabaseUrl } from "./env";

/**
 * The privileged client. Bypasses RLS entirely.
 *
 * `import "server-only"` at the top is the whole point of this file existing
 * separately: it makes importing the secret key into a client bundle a BUILD
 * ERROR rather than a breach discovered later. The runtime guard below covers
 * the case where a bundler is configured in a way that lets the import through.
 *
 * Legitimate callers are few and should stay few — the seed script, the
 * revalidation webhook handler, the RLS test harness, and eventually the
 * Paystack webhook. If you are reaching for this from a page or an action, the
 * answer is almost always a policy or an RPC instead.
 */
export const createAdminClient = () => {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase secret key must never reach the browser.");
  }

  return createSupabaseClient<Database>(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
