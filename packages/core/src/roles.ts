/**
 * Who can do what.
 *
 * The answer, since August 2026, is: everybody who is signed in can do
 * everything, except add and remove people. Take More is a handful of people
 * who all do every job, and three ranks described a shape the business does not
 * have — see 20260819110000_one_team_no_ranks.sql, which is where the rule
 * actually lives. Postgres enforces it; this module only decides what to draw.
 *
 * The ladder below is kept, unused by anything that matters, for one reason: it
 * is what makes putting ranks back a one-line decision on the day somebody
 * outside the family is hired. Deleting it would make that a refactor.
 */

export const APP_ROLES = ["staff", "manager", "owner"] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Higher outranks lower. Nothing in the app compares these today. */
const RANK: Record<AppRole, number> = { staff: 1, manager: 2, owner: 3 };

export const atLeast = (role: AppRole, required: AppRole) =>
  RANK[role] >= RANK[required];

/**
 * Everybody signed in sees what a machine cost.
 *
 * The twin is `app.can_see_costs()` (20260819090100_everyone_sees_costs.sql).
 * A salesperson who cannot see the floor cannot discount safely — they can only
 * guess, and the guess is the expensive part.
 */
export const canSeeCosts = (_role: AppRole) => true;

/**
 * Everybody signed in can correct a sale whose amount was typed wrong.
 *
 * Held back to manager until 20260819110000, because reopening rewrites revenue
 * that has already been reported. What settled it: in a business this size the
 * alternative is a wrong number waiting for one person to come back from lunch,
 * and every reopen is stamped with an actor in the activity log and explains
 * itself on the customer's timeline. A correction anybody can make and
 * everybody can see beats a correction nobody can make.
 */
export const canReopenSale = (_role: AppRole) => true;

/**
 * Everybody signed in can delete a machine — which is a SOFT delete.
 *
 * The row survives with `deleted_at` stamped and nothing in the app can reach
 * it again. The hard DELETE policy on the table is still owner-only and no
 * screen calls it; the one code path that erases a row for good is the discard
 * of a draft nobody ever filled in, and that decides on the state of the draft
 * rather than on who is holding the phone.
 */
export const canDeleteItems = (_role: AppRole) => true;

/**
 * Adding and removing people is the owner's, and stays the owner's.
 *
 * This is the one thing that did not flatten, and it is not a rank — it is the
 * door to the building. Approval into the ops app is now the ONLY thing between
 * somebody and every cost and margin in the business, precisely because
 * everything else opened up. The owner is who adds people anyway, so nothing
 * about a day's work goes through this.
 */
export const canManageTeam = (role: AppRole) => role === "owner";

/**
 * Kept for the one place a rank is still visible: the owner's own row.
 *
 * Nobody else's is labelled, because everybody else's is the same.
 */
export const ROLE_LABELS: Record<AppRole, string> = {
  staff: "Staff",
  manager: "Manager",
  owner: "Owner",
};
