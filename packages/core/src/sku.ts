/**
 * Item codes — `A042`.
 *
 * One letter and three digits, drawn from a global monotonic counter:
 * A001 … A999, then B001, and so on to Z999.
 *
 * I, L, O and U are not in the alphabet. The code exists to be written on a
 * machine by hand and read back into a search box, and in that setting I and L
 * are 1, O is 0, and U is V. Twenty-two letters is 21 978 codes, which at this
 * business's intake rate is decades — and running out raises rather than
 * wrapping, so the day it happens is a sentence somebody reads, not a
 * collision somebody finds later.
 *
 * The code carries no meaning. No category letter, no year. A category can
 * change during refurb and a printed label cannot, so an identifier a later
 * edit could contradict would be worse than an opaque one.
 *
 * Generation happens in the database (`app.next_sku()` drawing on
 * `app.item_code_seq`). This module exists so the ops app can read a code
 * somebody typed without a round trip, and so `packages/core/tests/parity.test.mjs`
 * can assert that these two implementations agree — the same arrangement as
 * `phone.ts` and `app.normalise_za_phone()`.
 *
 * The database column is still called `sku`, because renaming a column reaches
 * further than renaming a concept. Everything a person sees says "code".
 */

/** Twin of the literal inside `app.encode_item_code()`. */
export const ITEM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ";

/** 22 × 999. The last code is Z999. */
export const ITEM_CODE_CAPACITY = ITEM_CODE_ALPHABET.length * 999;

/** Twin of the `items_sku_shape` CHECK constraint. */
export const ITEM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTVWXYZ][0-9]{3}$/;

/**
 * Is this already a well-formed code? Strict — for "did somebody type a code
 * or a machine name", use `normaliseItemCode` instead, which is forgiving.
 */
export const isItemCode = (value: string): boolean =>
  ITEM_CODE_PATTERN.test(value.trim().toUpperCase());

/**
 * The nth code ever issued, 1-based. Mirrors `app.encode_item_code(bigint)`.
 *
 * Null past the end rather than an exception, because the caller that matters
 * is a test asserting the boundary; the database raises where it counts, at the
 * moment an insert would otherwise get a code that is not one.
 */
export const formatItemCode = (n: number): string | null => {
  if (!Number.isInteger(n) || n < 1 || n > ITEM_CODE_CAPACITY) return null;
  const letter = ITEM_CODE_ALPHABET[Math.floor((n - 1) / 999)];
  const digits = String(((n - 1) % 999) + 1).padStart(3, "0");
  return `${letter}${digits}`;
};

/**
 * What somebody typed, as a code — or null if it is not one.
 *
 * Mirrors `app.normalise_item_code(text)`. Uppercases, drops anything that is
 * not a letter or a digit, and pads the number, so `a42`, `A 042` and `a-042`
 * all reach the same machine. Returning null for a non-code is what lets a
 * caller say "that is not a code" without owning a second copy of the rule —
 * a bare `042` has no letter and a model number like `RG-4TX` has too many.
 */
export const normaliseItemCode = (raw: string | null | undefined): string | null => {
  const cleaned = (raw ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTVWXYZ][0-9]{1,3}$/.test(cleaned)) return null;
  return `${cleaned[0]}${cleaned.slice(1).padStart(3, "0")}`;
};
