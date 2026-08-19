/**
 * Orders — the words, and the one calculation the screen has to do twice.
 */

import type { Cents } from "./money.ts";

export const ORDER_STATUSES = ["draft", "paid", "void"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Open",
  paid: "Paid",
  void: "Cancelled",
};

export const PAYMENT_METHODS = ["card_machine", "bank_transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * What the salesperson ticks. Neither one moves money — the card machine and
 * the bank do that, and this records which of them it was so the day's takings
 * can be reconciled.
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card_machine: "Card machine",
  bank_transfer: "Bank transfer",
};

/**
 * Split a discounted total across the machines it was agreed for.
 *
 * The discount is given on the order — "R45 000 for the pair" — but revenue is
 * reported per machine, so the total has to be divided. Pro-rata by asking
 * price: a machine that was 60% of the ask carries 60% of the discount, which
 * is the only split that leaves each unit's margin percentage recognisable
 * afterwards.
 *
 * Every line but the last is floored and the last absorbs the remainder — at
 * most (lines − 1) cents — so the parts sum to the whole EXACTLY. A scheme that
 * can be a cent out is a dashboard that disagrees with a bank statement, and
 * finding out which of them is wrong costs more than the cent.
 *
 * The twin is the allocation loop inside `public.confirm_order_paid()`, which
 * is the one that counts; this exists so the screen can show a per-machine
 * figure before anything is written. `listPriceCents` must arrive in the same
 * order the database will iterate — by `position`, then `id`.
 */
export const allocateSoldTotal = (
  soldTotalCents: Cents,
  listPriceCents: readonly Cents[]
): Cents[] => {
  const n = listPriceCents.length;
  if (n === 0) return [];

  const listSum = listPriceCents.reduce((sum, c) => sum + c, 0);
  const out: Cents[] = [];
  let running = 0;

  for (let i = 0; i < n; i++) {
    let alloc: number;
    if (i === n - 1) {
      // Also the whole answer in the common case of one machine: no division,
      // so no rounding to be wrong about.
      alloc = soldTotalCents - running;
    } else if (listSum > 0) {
      alloc = Math.floor((soldTotalCents * listPriceCents[i]) / listSum);
    } else {
      // Nothing on the order had a price yet. Splitting evenly beats refusing:
      // it is a legitimate state, and the salesperson has already agreed a
      // number with the customer standing in front of them.
      alloc = Math.floor(soldTotalCents / n);
    }
    running += alloc;
    out.push(alloc);
  }

  return out;
};

/**
 * How far the agreed price is under the asking price.
 *
 * Null rather than zero when there is nothing to compare against, so a screen
 * can tell "no discount" from "no prices yet" — the second one should say
 * nothing at all rather than claim a saving of zero.
 */
export const discountCents = (
  listTotalCents: Cents,
  soldTotalCents: Cents | null
): Cents | null => {
  if (soldTotalCents === null || listTotalCents <= 0) return null;
  return listTotalCents - soldTotalCents;
};

/** The same discount as a percentage of the ask, to one decimal. */
export const discountPercent = (
  listTotalCents: Cents,
  soldTotalCents: Cents | null
): number | null => {
  const off = discountCents(listTotalCents, soldTotalCents);
  if (off === null) return null;
  return Math.round((off / listTotalCents) * 1000) / 10;
};
