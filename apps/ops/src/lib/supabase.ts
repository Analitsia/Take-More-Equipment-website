import { cache } from "react";
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
 * Signing in and being allowed in are two different things.
 *
 * Anyone who has requested access has a real, working auth account from the
 * moment they ask — that is what lets approval take effect without a password
 * being reissued or an email being clicked. So a valid session no longer means
 * a user of this application, and the difference has to be a state rather than
 * a null:
 *
 *   anonymous  no session at all                         → /login
 *   pending    signed in, nobody has approved them yet   → /pending
 *   revoked    approved once, since deactivated          → /login, told why
 *   active     approved and not deactivated              → the app
 *
 * Collapsing `pending` into `anonymous` is what produces the bug this replaces:
 * the person signs in successfully, lands on /login again because they are not
 * staff, and concludes the password is wrong.
 */
export type StaffState =
  | { state: "anonymous" }
  | { state: "pending"; email: string; fullName: string; requestedAt: string }
  | { state: "revoked" }
  | { state: "active"; session: Session };

/**
 * Who this request belongs to, and what they are allowed to be shown.
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
 * removed to keep working. The same property is what makes approval feel
 * instant: it is a column read on every request, not a claim baked into a token
 * an hour ago.
 *
 * Wrapped in React's cache() so the layout and the page it renders share one
 * answer per request instead of each paying the claims check and the profile
 * read again. The scope is a single request — the very next navigation
 * re-checks, so revoking someone still takes effect on their next click.
 */
export const staffState = cache(async (): Promise<StaffState> => {
  const client = await supabase();

  const { data: claimsData } = await client.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return { state: "anonymous" };

  // Readable even while pending, through the "a person may read their own
  // profile" policy — otherwise the waiting screen could not read the row it
  // is waiting on.
  const { data: profile } = await client
    .from("staff_profiles")
    .select("full_name, role, active, approved_at, created_at")
    .eq("user_id", claims.sub)
    .maybeSingle();

  // A session with no profile row at all. Our own request flow always writes
  // one, so this is an account created some other way — the bootstrap script
  // mid-run, or a row an owner deleted while the person was signed in.
  if (!profile) return { state: "revoked" };

  if (!profile.approved_at) {
    return {
      state: "pending",
      email: (claims.email as string) ?? "",
      fullName: profile.full_name,
      requestedAt: profile.created_at,
    };
  }

  if (!profile.active) return { state: "revoked" };

  return {
    state: "active",
    session: {
      userId: claims.sub as string,
      email: (claims.email as string) ?? "",
      fullName: profile.full_name,
      role: profile.role,
    },
  };
});

/** The signed-in staff member, or null. Kept for callers that only need that. */
export async function currentStaff(): Promise<Session | null> {
  const state = await staffState();
  return state.state === "active" ? state.session : null;
}

/**
 * For pages that must not render at all without an approved session.
 *
 * Someone waiting on approval is sent to the screen that explains that, rather
 * than to a login form they have already successfully used.
 */
export async function requireStaff(): Promise<Session> {
  const state = await staffState();
  if (state.state === "active") return state.session;
  if (state.state === "pending") redirect("/pending");
  redirect("/login");
}
