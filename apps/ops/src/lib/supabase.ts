import { cookies } from "next/headers";
import { createStaffClient } from "@takemore/db";
import type { AppRole } from "@takemore/core";
import { redirect } from "next/navigation";

/**
 * Server-side Supabase access, as the signed-in staff member.
 *
 * `cookies()` is imported here rather than inside @takemore/db so that package
 * stays framework-agnostic — the seed script and the test harnesses import it
 * too, and neither has a Next.js request to hand.
 */
export async function supabase() {
  const store = await cookies();
  return createStaffClient({
    getAll: () => store.getAll(),
    set: (name, value, options) => store.set(name, value, options),
  });
}

export type Session = {
  userId: string;
  email: string;
  fullName: string;
  role: AppRole;
};

/**
 * The signed-in staff member, or null.
 *
 * Authentication comes from `getClaims()`, which verifies the JWT signature
 * against the project's published keys. `getSession()` is never used here —
 * Supabase is explicit that it is not guaranteed to revalidate the token, which
 * makes it fine for "show a name in the corner" and wrong for anything that
 * decides what someone may do.
 *
 * The ROLE, though, comes from staff_profiles rather than the token, matching
 * what the RLS policies do. A token is only reissued on refresh, so a role read
 * from it can be an hour stale — long enough for someone who has just been
 * removed to keep working.
 */
export async function currentStaff(): Promise<Session | null> {
  const client = await supabase();

  const { data: claimsData } = await client.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await client
    .from("staff_profiles")
    .select("full_name, role, active")
    .eq("user_id", claims.sub)
    .maybeSingle();

  // Authenticated but not staff — or deactivated. Either way, not a user of
  // this application.
  if (!profile || !profile.active) return null;

  return {
    userId: claims.sub as string,
    email: (claims.email as string) ?? "",
    fullName: profile.full_name,
    role: profile.role,
  };
}

/** For pages that must not render at all without a session. */
export async function requireStaff(): Promise<Session> {
  const staff = await currentStaff();
  if (!staff) redirect("/login");
  return staff;
}
