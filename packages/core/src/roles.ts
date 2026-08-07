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
 * Costs and margin are the one thing a `staff` account must never see — they
 * type the auction price in at intake and cannot read it back. Enforced in
 * Postgres by keeping costs in their own table; this is only for hiding the
 * controls that would 403 anyway.
 */
export const canSeeCosts = (role: AppRole) => atLeast(role, "manager");

export const canManageTeam = (role: AppRole) => role === "owner";

export const canDeleteItems = (role: AppRole) => role === "owner";

export const ROLE_LABELS: Record<AppRole, string> = {
  staff: "Staff",
  manager: "Manager",
  owner: "Owner",
};
