import {
  PRICE_BANDS,
  stock,
  type Category,
  type Equipment,
  type Grade,
  type PriceBandId,
  type Tag,
} from "./equipment";

export {
  CATEGORIES,
  GRADES,
  PRICE_BANDS,
  TAGS,
  categoryMeta,
  countByCategory,
} from "./equipment";

export type Filters = {
  categories: Category[];
  grades: Grade[];
  tags: Tag[];
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
export function applyFilters(filters: Filters): Equipment[] {
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
