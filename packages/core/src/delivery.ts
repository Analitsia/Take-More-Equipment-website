/**
 * What we charge to put a machine on a truck.
 *
 * R250 covers the first ten kilometres. Every kilometre past that is R10, and a
 * part-kilometre is charged as a whole one, so the customer is never quoted
 * less than the driver spends.
 *
 *   0 km → R250   ·   10 km → R250   ·   10.1 km → R260   ·   100 km → R1 150
 *
 * The twin is `public.delivery_fee_cents(numeric)`, and the database is the one
 * that decides: `orders.delivery_fee_cents` is recomputed from the stored
 * distance by a trigger on every write, so no caller can put a number in that
 * column the rule would not produce. This copy exists so the fee moves as the
 * salesperson drags the distance, without a round trip per keystroke — and
 * `packages/core/tests/parity.test.mjs` is what keeps the two honest.
 *
 * Not to be confused with `cost_kind.transport`, which is what WE paid to bring
 * a machine in and is subtracted from margin. Same English word, opposite sign.
 */

import type { Cents } from "./money.ts";

export const DELIVERY_BASE_CENTS = 25_000;
export const DELIVERY_INCLUDED_KM = 10;
export const DELIVERY_PER_KM_CENTS = 1_000;

export const deliveryFeeCents = (km: number | null | undefined): Cents => {
  if (km === null || km === undefined || Number.isNaN(km)) return 0;

  /**
   * Worked in whole tenths rather than in floating point.
   *
   * `orders.delivery_km` is `numeric(6,1)`, so a distance is at most one
   * decimal place and Postgres rounds anything longer on the way in. Rounding
   * to tenths here does the same thing, and then the arithmetic is integer —
   * which matters because `Math.ceil(20.1 - 10)` and Postgres `ceil(10.1)` are
   * only equal by luck, and the luck runs out silently on some other value.
   */
  const tenths = Math.round(km * 10);
  const includedTenths = DELIVERY_INCLUDED_KM * 10;

  if (tenths <= includedTenths) return DELIVERY_BASE_CENTS;

  const extraKm = Math.ceil((tenths - includedTenths) / 10);
  return DELIVERY_BASE_CENTS + extraKm * DELIVERY_PER_KM_CENTS;
};

/** "R250 covers the first 10 km, then R10/km." Said once, on the screen. */
export const DELIVERY_RULE_LABEL =
  `R${DELIVERY_BASE_CENTS / 100} up to ${DELIVERY_INCLUDED_KM} km, ` +
  `then R${DELIVERY_PER_KM_CENTS / 100} per km, rounded up`;
