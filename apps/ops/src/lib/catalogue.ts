/**
 * The shape of the catalogue tree, and the one thing every screen does with it.
 *
 * Separate from lib/queries.ts on purpose: that module imports the cookie-bound
 * staff client and so can only ever run on the server, while half the screens
 * that render a category dropdown are client components. A type and a pure
 * function have no business dragging a database client into a browser bundle.
 *
 * The tree is Division → Category → Subcategory. The shop sells catering
 * equipment and homestaging furniture through one warehouse, and the top level
 * is what keeps a wardrobe out of a list that starts with Wash-Up.
 */

export type CategoryOption = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  division_id: string;
  /**
   * Null only if the embed failed. `categories.division_id` is NOT NULL in the
   * schema, so a missing division means a broken read, not a category without
   * a line of business — which is why callers fall back to a heading rather
   * than dropping the row.
   */
  division: { id: string; name: string; slug: string; position: number } | null;
};

/**
 * Categories under the heading of the line of business they belong to.
 *
 * For the screens that keep a single category dropdown — the lead ones, where a
 * third select would crowd a card that is already two columns wide. They render
 * these as <optgroup>s, which separates the two lines without adding a control.
 *
 * Order is taken from the input rather than recomputed: getCategories() already
 * returns divisions in the order they are offered and categories in the order
 * they were given inside each.
 */
export function byDivision(
  categories: readonly CategoryOption[]
): { name: string; categories: CategoryOption[] }[] {
  const groups: { name: string; categories: CategoryOption[] }[] = [];
  for (const category of categories) {
    const name = category.division?.name ?? "Other";
    const group = groups.find((g) => g.name === name);
    if (group) group.categories.push(category);
    else groups.push({ name, categories: [category] });
  }
  return groups;
}
