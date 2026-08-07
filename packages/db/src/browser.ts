import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types.generated";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * The client for Client Components in apps/ops — the kanban board's realtime
 * subscription, optimistic edits, media uploads.
 *
 * Reads and writes as the signed-in staff member, so every RLS policy applies.
 * There is no browser client for the storefront: it is anonymous and server-
 * rendered, and shipping a Supabase client to visitors would only add weight.
 */
export const createClient = () =>
  createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
