/**
 * The item lifecycle.
 *
 * This table is mirrored exactly by `public.item_status_transitions` in the
 * database, and a CI test asserts the two agree row for row. The trigger on
 * `items` is what makes an illegal move impossible; this copy exists so the
 * ops UI can offer the legal moves as buttons instead of letting a worker
 * discover them by getting an error.
 *
 * Keep the two in sync or the test fails — which is the point.
 */

import { atLeast, type AppRole } from "./roles.ts";

export const ITEM_STATUSES = [
  "intake",
  "refurbishing",
  "ready",
  "listed",
  "reserved",
  "sold",
  "handed_over",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type Transition = {
  from: ItemStatus;
  to: ItemStatus;
  /** The lowest role allowed to make this move. */
  minRole: AppRole;
  /** Verb for the button. Written from the worker's point of view. */
  label: string;
};

/**
 * THE RULE: for every transition A -> B there is a B -> A, and both cost the
 * same role. Nothing here is a one-way door.
 *
 * Anyone who can create a given state can always put it back, so a worker
 * exploring the buttons cannot strand a machine somewhere only their boss can
 * retrieve it from. Asymmetric roles were the real bottleneck — a staff member
 * could send a machine to the workshop but needed a manager to bring it back,
 * and in practice the record just stayed wrong.
 *
 * A test asserts this symmetry, and it asserts these rows match the database.
 */
export const TRANSITIONS: readonly Transition[] = [
  { from: "intake", to: "refurbishing", minRole: "staff", label: "Send to workshop" },
  { from: "refurbishing", to: "intake", minRole: "staff", label: "Back to intake" },

  { from: "intake", to: "ready", minRole: "staff", label: "Already sound — skip workshop" },
  { from: "ready", to: "intake", minRole: "staff", label: "Back to intake" },

  { from: "refurbishing", to: "ready", minRole: "staff", label: "Workshop complete" },
  { from: "ready", to: "refurbishing", minRole: "staff", label: "Back to workshop" },

  { from: "ready", to: "listed", minRole: "staff", label: "List for sale" },
  { from: "listed", to: "ready", minRole: "staff", label: "Withdraw from sale" },

  { from: "listed", to: "reserved", minRole: "staff", label: "Reserve for a buyer" },
  { from: "reserved", to: "listed", minRole: "staff", label: "Release reservation" },

  // The money moves stay a manager's, on both sides. Staff cannot mark a machine
  // sold, so they cannot create that particular mess either — which is the same
  // guarantee as the rule above, arrived at from the other direction.
  { from: "listed", to: "sold", minRole: "manager", label: "Mark sold" },
  { from: "sold", to: "listed", minRole: "manager", label: "Reverse sale" },

  { from: "reserved", to: "sold", minRole: "manager", label: "Confirm sale" },
  { from: "sold", to: "reserved", minRole: "manager", label: "Back to reserved" },

  { from: "sold", to: "handed_over", minRole: "staff", label: "Handed over" },
  { from: "handed_over", to: "sold", minRole: "staff", label: "Undo handover" },
] as const;

/**
 * Is this move along the lifecycle, or back up it?
 *
 * Read straight off ITEM_STATUSES, which is declared in lifecycle order, so
 * there is no second list to keep in step. The ops app uses it to draw going
 * forward and stepping back as visibly different things.
 */
export const isForward = (from: ItemStatus, to: ItemStatus) =>
  ITEM_STATUSES.indexOf(to) > ITEM_STATUSES.indexOf(from);

export const canTransition = (from: ItemStatus, to: ItemStatus, role: AppRole) => {
  const move = TRANSITIONS.find((t) => t.from === from && t.to === to);
  return !!move && atLeast(role, move.minRole);
};

/** What this worker can do with this item right now — renders the card's buttons. */
export const nextStatuses = (from: ItemStatus, role: AppRole) =>
  TRANSITIONS.filter((t) => t.from === from && atLeast(role, t.minRole));

export const STATUS_LABELS: Record<ItemStatus, string> = {
  intake: "Intake",
  refurbishing: "In workshop",
  ready: "Ready",
  listed: "Listed",
  reserved: "Reserved",
  sold: "Sold",
  handed_over: "Handed over",
};

/**
 * Board order. Also the order the dashboard counts them in, so a single
 * definition keeps the two from drifting apart visually.
 */
export const STATUS_ORDER: readonly ItemStatus[] = ITEM_STATUSES;

/**
 * Whether an item in this status is still ours to sell. Drives the dashboard's
 * "stock on hand" figures — a handed-over machine is gone, a sold one is
 * physically still in the warehouse and still occupying shelf space.
 */
export const isOnHand = (status: ItemStatus) => status !== "handed_over";

/** Statuses a buyer can still act on. `reserved` is held for someone else. */
export const isAvailable = (status: ItemStatus) => status === "listed";
