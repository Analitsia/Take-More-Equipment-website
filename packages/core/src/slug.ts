/**
 * Slugs.
 *
 * This function has a twin in SQL (`app.slugify`), because the database
 * generates the slug on insert and the ops form previews it as you type. A CI
 * test runs both over the same fixtures — including "Wash-Up" and "6-Grid Combi
 * Steamer" — and fails if they disagree, since a preview that lies about the
 * URL is worse than no preview.
 */

export const slugify = (input: string): string =>
  input
    // Decompose accents to letter + combining mark, then drop the marks, so
    // "Brûlé" becomes "brule" rather than "brl".
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * A published slug is frozen. An item that has been live has been indexed,
 * linked from WhatsApp threads, and possibly printed on a label — renaming the
 * machine must not move its URL.
 *
 * The database enforces this in a trigger; this is the check that greys out the
 * title field's "this will change the URL" hint in the ops form.
 */
export const slugIsFrozen = (publishedAt: string | Date | null) =>
  publishedAt !== null;
