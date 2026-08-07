/**
 * SKUs — `TME-2608-0417`.
 *
 * `TME` + the year and month the unit was taken in + a zero-padded counter.
 * The counter comes from a Postgres sequence rather than a count of existing
 * rows, so two workers submitting intakes at the same moment cannot collide.
 *
 * The sequence is global, not per-month, which means the last four digits do
 * not restart in January. That is fine — uniqueness is a property of the whole
 * string, and a monotonic counter is one fewer thing to get wrong. Past 9 999
 * items it simply grows to five digits, which the pattern below allows for.
 *
 * Generation happens in the database (`app.next_sku()`); this module exists so
 * the ops app can validate a hand-typed SKU in a search box and so a CI test
 * can assert the trigger still emits what this file describes.
 */

export const SKU_PREFIX = "TME";

export const SKU_PATTERN = /^TME-\d{4}-\d{4,}$/;

export const isSku = (value: string) => SKU_PATTERN.test(value.trim().toUpperCase());

/** The `2608` part: two-digit year, two-digit month. */
export const skuPeriod = (date: Date): string => {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
};

export const formatSku = (date: Date, sequence: number): string =>
  `${SKU_PREFIX}-${skuPeriod(date)}-${String(sequence).padStart(4, "0")}`;
