/**
 * @takemore/db — schema types and typed Supabase clients.
 *
 * Deliberately does NOT re-export ./admin. The privileged client is reachable
 * only as `@takemore/db/admin`, so importing it is always a visible, explicit
 * act in a diff rather than something that arrives with a barrel import.
 */

export type { Database } from "./types.generated";
export { createClient as createBrowserClient } from "./browser";
export { createPublicClient, createStaffClient } from "./server";
