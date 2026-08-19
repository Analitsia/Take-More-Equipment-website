/**
 * Staff roles, ranked.
 *
 * The database is authoritative — every one of these is re-checked by an RLS
 * policy — but the ops UI needs the same ladder to decide what to render, and
 * two copies of a rule that can disagree is worse than one copy imported twice.
 */

export const APP_ROLES = ["staff", "manager", "owner"] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Higher outranks lower. Only ever compared, never persisted. */
const RANK: Record<AppRole, number> = { staff: 1, manager: 2, owner: 3 };

export const atLeast = (role: AppRole, required: AppRole) =>
  RANK[role] >= RANK[required];

/**
 * Everybody signed in sees what a machine cost.
 *
 * This was `atLeast(role, "manager")` until August 2026, on the reasoning that
 * a `staff` account types the auction price in at intake and should not read it
 * back. It is a family business where the person negotiating at the counter is
 * whoever is standing there, and a salesperson who cannot see the floor cannot
 * discount safely — they can only guess, and the guess is the expensive part.
 *
 * The twin is `app.can_see_costs()` (20260819090100_everyone_sees_costs.sql),
 * and Postgres is still the one enforcing it. This copy exists only to decide
 * what to render, and it takes `role` it no longer reads so that re-restricting
 * is one expression here and one function there rather than a refactor.
 */
export const canSeeCosts = (_role: AppRole) => true;

export const canManageTeam = (role: AppRole) => role === "owner";

export const canDeleteItems = (role: AppRole) => role === "owner";

export const ROLE_LABELS: Record<AppRole, string> = {
  staff: "Staff",
  manager: "Manager",
  owner: "Owner",
};
