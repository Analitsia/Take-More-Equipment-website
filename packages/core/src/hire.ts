/**
 * What a machine earns by the day when it goes out on hire.
 *
 * The rate is not negotiated; it is derived from the asking price:
 *
 *   daily rate      = 4 % of the asking price
 *   days 1–7        = the full daily rate
 *   day 8 onwards   = the daily rate less 15 %
 *
 *   R10 000 machine → R400 a day → 10 days = 7 × R400 + 3 × R340 = R3 820
 *
 * The twin is `public.hire_fee_cents(bigint, integer)`, and the database is the
 * one that decides: `confirm_hire_paid()` computes the total from the dates and
 * the frozen asking prices in the same statement that records the payment, so
 * no caller can put a hire figure on an order the rule would not produce. This
 * copy exists so the screen can show the figure as the dates are typed, and
 * the schema and parity suites keep the two honest.
 *
 * Every step rounds half up on a positive number, which is the one case where
 * JavaScript's Math.round and Postgres's round() agree.
 */

import type { Cents } from "./money.ts";

export const HIRE_DAILY_RATE_PERCENT = 4;
export const HIRE_FULL_RATE_DAYS = 7;
export const HIRE_LONG_DISCOUNT_PERCENT = 15;

/**
 * Inclusive: out on the 1st, back on the 1st is one day. Null when either date
 * is missing or they are the wrong way round, so a screen can tell "not yet"
 * from "zero".
 */
export const hireDays = (
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
): number | null => {
  const a = toUtcDay(start);
  const b = toUtcDay(end);
  if (a === null || b === null || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
};

/** 4 % of the asking price, to the cent. */
export const hireDailyRateCents = (listCents: Cents | null | undefined): Cents => {
  if (!listCents || listCents <= 0) return 0;
  return Math.round((listCents * HIRE_DAILY_RATE_PERCENT) / 100);
};

/**
 * The daily rate after the first week. Rounded on its own — round(daily × 0.85),
 * not round(list × 0.034) — so "R400 a day, R340 after a week" multiplies out
 * to exactly the total on the invoice.
 */
export const hireDiscountedRateCents = (listCents: Cents | null | undefined): Cents =>
  Math.round((hireDailyRateCents(listCents) * (100 - HIRE_LONG_DISCOUNT_PERCENT)) / 100);

export const hireFeeCents = (
  listCents: Cents | null | undefined,
  days: number | null | undefined
): Cents => {
  if (!days || days <= 0) return 0;
  const full = Math.min(days, HIRE_FULL_RATE_DAYS);
  const discounted = Math.max(days - HIRE_FULL_RATE_DAYS, 0);
  return hireDailyRateCents(listCents) * full + hireDiscountedRateCents(listCents) * discounted;
};

/** The arithmetic, spelled out for the screen. */
export type HireBreakdown = {
  days: number;
  dailyCents: Cents;
  discountedCents: Cents;
  fullDays: number;
  discountedDays: number;
  totalCents: Cents;
};

export const hireBreakdown = (listCents: Cents | null | undefined, days: number): HireBreakdown => {
  const fullDays = Math.min(Math.max(days, 0), HIRE_FULL_RATE_DAYS);
  const discountedDays = Math.max(days - HIRE_FULL_RATE_DAYS, 0);
  return {
    days,
    dailyCents: hireDailyRateCents(listCents),
    discountedCents: hireDiscountedRateCents(listCents),
    fullDays,
    discountedDays,
    totalCents: hireFeeCents(listCents, days),
  };
};

/** Said once, on the screen. */
export const HIRE_RULE_LABEL =
  `${HIRE_DAILY_RATE_PERCENT}% of the asking price per day · ` +
  `${HIRE_LONG_DISCOUNT_PERCENT}% off from day ${HIRE_FULL_RATE_DAYS + 1}`;

/**
 * A calendar day as a UTC midnight timestamp. Dates arrive as `2026-09-01`
 * from a date input or from Postgres, and must not drift by a timezone: a hire
 * that starts on the 1st starts on the 1st in Cape Town, whatever the server
 * thinks the hour is.
 */
const toUtcDay = (value: string | Date | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};
