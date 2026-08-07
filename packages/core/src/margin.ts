/**
 * Per-unit economics.
 *
 * Margin is never stored. It is a view in the database and these functions in
 * the ops app, computed from the cost ledger and the price, so it cannot drift
 * out of date behind an edit somebody forgot to propagate.
 *
 * The duplication between here and SQL is deliberate and narrow: SQL computes
 * margin for dashboards and sorting, this computes it live in the intake form
 * while a manager is still typing a price and nothing has been saved. One test
 * asserts the two agree over a fixture set.
 */

import type { Cents } from "./money.ts";

export const COST_KINDS = [
  "auction",
  "buyers_premium",
  "transport",
  "parts",
  "labour",
  "other",
] as const;
export type CostKind = (typeof COST_KINDS)[number];

export const COST_KIND_LABELS: Record<CostKind, string> = {
  auction: "Auction price",
  buyers_premium: "Buyer's premium",
  transport: "Transport",
  parts: "Parts",
  labour: "Labour",
  other: "Other",
};

/**
 * The two boxes the intake form actually shows. Everything else is a line a
 * manager adds later — asking a worker holding a phone in a warehouse to split
 * a repair into parts and labour is how you lose the ninety-second target.
 */
export const INTAKE_COST_KINDS: readonly CostKind[] = ["auction", "parts"];

export type CostLine = { kind: CostKind; amountCents: Cents };

export const totalCostCents = (lines: readonly CostLine[]): Cents =>
  lines.reduce((sum, line) => sum + line.amountCents, 0);

/**
 * What we actually made, or expect to. Falls back to the asking price when the
 * unit hasn't sold yet, so the number means "margin at this price" before a
 * sale and "margin achieved" after one.
 */
export const marginCents = (
  listPriceCents: Cents | null,
  salePriceCents: Cents | null,
  totalCost: Cents
): Cents | null => {
  const realised = salePriceCents ?? listPriceCents;
  if (realised === null) return null;
  return realised - totalCost;
};

/**
 * Margin as a percentage of the selling price, to one decimal.
 *
 * Of price, not of cost — this is the number that answers "how much of what the
 * customer pays do we keep", which is what a pricing decision turns on. Returns
 * null at a zero or missing price rather than dividing by nothing.
 */
export const marginPercent = (
  listPriceCents: Cents | null,
  salePriceCents: Cents | null,
  totalCost: Cents
): number | null => {
  const realised = salePriceCents ?? listPriceCents;
  if (realised === null || realised <= 0) return null;
  return Math.round(((realised - totalCost) / realised) * 1000) / 10;
};

/** Days between intake and sale — the rotation figure the KPI board is built on. */
export const daysToSale = (
  arrivedAt: Date | string,
  soldAt: Date | string | null
): number | null => {
  if (!soldAt) return null;
  const from = new Date(arrivedAt).getTime();
  const to = new Date(soldAt).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
};
