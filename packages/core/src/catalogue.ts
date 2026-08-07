/**
 * Catalogue filtering and sorting.
 *
 * Ported from apps/web/src/data/filters.ts with two changes and no behavioural
 * ones: the item list is a parameter instead of a module-level import (the
 * array now comes from the database, and apps/ops wants the same logic over a
 * different list), and prices are cents.
 *
 * This stays client-side. At a realistic 50–500 published units the whole card
 * projection is well under 150 KB, and filtering in memory with no round-trip
 * is a better catalogue than one that waits on the network per checkbox.
 */

import type { ConditionGrade } from "./grades.ts";
import type { Cents } from "./money.ts";

/** Everything a stock card renders, and nothing else. */
export type CatalogueItem = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  categorySlug: string;
  categoryName: string;
  grade: ConditionGrade;
  listPriceCents: Cents;
  retailPriceCents: Cents | null;
  capacity: string | null;
  power: string | null;
  tagSlugs: string[];
  /** Storage path of the first photo. Null renders the placeholder frame. */
  primaryImagePath: string | null;
  /** Derived from status — a handed-over unit is still "sold" to a visitor. */
  sold: boolean;
  featured: boolean;
};

export const PRICE_BANDS = [
  { id: "under-5k", label: "Under R5 000", minCents: 0, maxCents: 500_000 },
  { id: "5k-15k", label: "R5 000 – R15 000", minCents: 500_000, maxCents: 1_500_000 },
  { id: "15k-50k", label: "R15 000 – R50 000", minCents: 1_500_000, maxCents: 5_000_000 },
  { id: "over-50k", label: "Over R50 000", minCents: 5_000_000, maxCents: Infinity },
] as const;
export type PriceBandId = (typeof PRICE_BANDS)[number]["id"];

/**
 * Categories and tags are lookup tables now, so these are slugs rather than a
 * closed union — the vocabulary comes from the database with the items.
 */
export type Filters = {
  categories: string[];
  grades: ConditionGrade[];
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
  items: readonly CatalogueItem[],
  filters: Filters
): CatalogueItem[] {
  const band = PRICE_BANDS.find((b) => b.id === filters.price);

  return items.filter((item) => {
    if (filters.categories.length && !filters.categories.includes(item.categorySlug))
      return false;
    if (filters.grades.length && !filters.grades.includes(item.grade)) return false;
    if (filters.tags.length && !filters.tags.some((tag) => item.tagSlugs.includes(tag)))
      return false;
    if (
      band &&
      (item.listPriceCents < band.minCents || item.listPriceCents >= band.maxCents)
    )
      return false;
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

const savingOf = (item: CatalogueItem) =>
  item.retailPriceCents
    ? (item.retailPriceCents - item.listPriceCents) / item.retailPriceCents
    : 0;

export function applySort(
  items: readonly CatalogueItem[],
  sort: SortId
): CatalogueItem[] {
  const sorted = [...items];
  switch (sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.listPriceCents - b.listPriceCents);
    case "price-desc":
      return sorted.sort((a, b) => b.listPriceCents - a.listPriceCents);
    case "saving":
      return sorted.sort((a, b) => savingOf(b) - savingOf(a));
    default:
      // Featured first, then sold units sink to the bottom.
      return sorted.sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) || Number(a.sold) - Number(b.sold)
      );
  }
}

/**
 * Related stock: same category first, then anything in a similar price bracket,
 * so a page always fills its row even in a thin category.
 */
export function relatedTo(
  items: readonly CatalogueItem[],
  item: CatalogueItem,
  limit = 3
): CatalogueItem[] {
  const others = items.filter((candidate) => candidate.slug !== item.slug);
  const sameCategory = others.filter((c) => c.categorySlug === item.categorySlug);
  const byPrice = others
    .filter((c) => c.categorySlug !== item.categorySlug)
    .sort(
      (a, b) =>
        Math.abs(a.listPriceCents - item.listPriceCents) -
        Math.abs(b.listPriceCents - item.listPriceCents)
    );
  return [...sameCategory, ...byPrice].slice(0, limit);
}

export const WARRANTY_MONTHS = 6;

/** Light items go on a courier; anything heavy is delivered or collected. */
export function deliveryFor(weightKg: number | null) {
  return weightKg !== null && weightKg <= 30
    ? {
        headline: "Nationwide courier",
        detail: "2–4 working days to most major centres, quoted on enquiry.",
      }
    : {
        headline: "Delivered or collected",
        detail:
          "Cape Town delivery within 48 hours, quoted by distance. Or collect free from Montague Gardens.",
      };
}
