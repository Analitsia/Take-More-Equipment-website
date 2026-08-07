import { PRICE_BANDS, type Equipment, type Grade, type PriceBandId } from "./equipment";

export { GRADES, PRICE_BANDS } from "./equipment";

/**
 * Filtering and sorting.
 *
 * The item list is a parameter now rather than a module import — the array
 * comes from the database and is handed down from a server component, so these
 * stay pure functions with no idea where their input came from.
 */

export type Filters = {
  /** Category names, matching Equipment.category. */
  categories: string[];
  grades: Grade[];
  /** Tag slugs, matching Equipment.tags. */
  tags: string[];
  price: PriceBandId | null;
  hideSold: boolean;
};

export const emptyFilters: Filters = {
  categories: [],
  grades: [],
  tags: [],
  price: null,
  hideSold: false,
};

export const countActive = (filters: Filters) =>
  filters.categories.length +
  filters.grades.length +
  filters.tags.length +
  (filters.price ? 1 : 0) +
  (filters.hideSold ? 1 : 0);

/** Groups are ANDed together; values inside a group are ORed. */
export function applyFilters(
  stock: readonly Equipment[],
  filters: Filters
): Equipment[] {
  const band = PRICE_BANDS.find((b) => b.id === filters.price);

  return stock.filter((item) => {
    if (filters.categories.length && !filters.categories.includes(item.category))
      return false;
    if (filters.grades.length && !filters.grades.includes(item.grade)) return false;
    if (filters.tags.length && !filters.tags.some((tag) => item.tags.includes(tag)))
      return false;
    if (band && (item.price < band.min || item.price >= band.max)) return false;
    if (filters.hideSold && item.sold) return false;
    return true;
  });
}

export const SORTS = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "saving", label: "Biggest saving" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

const savingOf = (item: Equipment) =>
  item.retailPrice ? (item.retailPrice - item.price) / item.retailPrice : 0;

export function applySort(items: Equipment[], sort: SortId): Equipment[] {
  const sorted = [...items];
  switch (sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "saving":
      return sorted.sort((a, b) => savingOf(b) - savingOf(a));
    default:
      // Featured first, then sold units sink to the bottom.
      return sorted.sort(
        (a, b) =>
          Number(!!b.featured) - Number(!!a.featured) ||
          Number(!!a.sold) - Number(!!b.sold)
      );
  }
}

/** Tag slugs read badly in a filter list — "glass-door" should say "Glass door". */
export const tagLabel = (slug: string) =>
  slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
