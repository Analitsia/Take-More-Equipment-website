/**
 * The four environment variables this platform runs on, read in one place so a
 * missing one fails loudly at startup rather than as a confusing 401 later.
 *
 * New-format keys throughout — `sb_publishable_…` / `sb_secret_…`. The legacy
 * anon/service_role pair still works today but is deleted at the end of 2026,
 * and new projects no longer issue it.
 */

const required = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. See the setup steps in the build plan.`
    );
  }
  return value;
};

export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Safe in a browser bundle. Carries the same low privilege the anon key did. */
export const supabasePublishableKey = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );

/**
 * Bypasses RLS entirely. Server environments only, and never in a variable
 * prefixed NEXT_PUBLIC_ — shipping this to a browser is the single most common
 * way Supabase apps get breached. Only ./admin.ts may call it, and that module
 * imports `server-only` so a client import is a build failure.
 */
export const supabaseSecretKey = () =>
  required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
