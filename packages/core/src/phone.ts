/**
 * One phone number, one spelling.
 *
 * This function has a twin in SQL (`app.normalise_za_phone`), because the
 * database generates `leads.phone_e164` from it and a unique index sits on the
 * result — while the ops form wants to show the canonical number back as you
 * type, and the storefront wants to tell you a number is unusable before it
 * posts. A CI test runs both over the same fixtures and fails if they disagree.
 *
 * Why it matters more here than for slugs: the same person is written down as
 * "082 123 4567" by one worker, "+27 (0)82 123 4567" from a letterhead and
 * "0821234567" by the website form. Unless those collapse to one string they are
 * three customers, and a CRM with three rows for one person is one nobody trusts.
 */

/** Canonical E.164, or null if the input is not a number anyone could dial. */
export const normalisePhone = (raw: string | null | undefined): string | null => {
  const trimmed = (raw ?? "").trim();
  // A leading + is the only non-digit in the input that carries meaning.
  const plus = trimmed.startsWith("+");

  let digits = trimmed.replace(/[^0-9]/g, "");
  // 00 is the other way of writing +.
  if (digits.startsWith("00")) digits = digits.slice(2);

  let intl: string | null;
  if (digits === "") {
    intl = null;
  } else if (plus || digits.length > 10) {
    // Already international. Kept as given — Take More sells to people who
    // cross the border for a deal, and rewriting a Namibian number into +27
    // would make it undiallable.
    intl = digits;
  } else if (digits.length === 10 && digits.startsWith("0")) {
    // 0821234567 and 0215550134 — national form, trunk 0 dropped.
    intl = `27${digits.slice(1)}`;
  } else if (digits.length === 9) {
    // 821234567 — the trunk 0 left off, which is how people say it aloud.
    intl = `27${digits}`;
  } else {
    // A short fragment or a mistyped extension. Inventing a country code would
    // mint a false identity two real people could collide on.
    intl = null;
  }

  if (intl === null) return null;

  // +27 (0)82 … — a national trunk zero written inside an international number.
  // A South African subscriber number is nine digits and never starts with
  // zero, so 27 + 0 + nine more is unambiguous.
  if (intl.startsWith("270") && intl.length === 12) return `+27${intl.slice(3)}`;
  return `+${intl}`;
};

/**
 * How a South African reads their own number back.
 *
 * E.164 is for storage and for wa.me; nobody at a counter recognises
 * +27821234567 as fast as they recognise 082 123 4567. Foreign numbers are left
 * international, because the grouping rules are national and guessing produces
 * something that looks wrong to the only person who would notice.
 */
export const formatPhone = (raw: string | null | undefined): string => {
  const e164 = normalisePhone(raw);
  if (!e164) return (raw ?? "").trim();
  if (!e164.startsWith("+27") || e164.length !== 12) return e164;
  const national = `0${e164.slice(3)}`;
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
};

/** The digits-only form wa.me wants. Null when there is nothing to dial. */
export const whatsappDigits = (raw: string | null | undefined): string | null => {
  const e164 = normalisePhone(raw);
  return e164 ? e164.slice(1) : null;
};
