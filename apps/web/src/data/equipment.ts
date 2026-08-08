/**
 * The storefront's view model.
 *
 * This file used to hold seventeen hand-written machines. It now holds only the
 * shape they had and the pure functions that work on it — the data itself comes
 * from Supabase via src/lib/stock.ts.
 *
 * Prices here are RANDS, not cents. The database and @takemore/core both work
 * in cents, and the single conversion happens in the mapper in src/lib/stock.ts.
 * Keeping this boundary means the components below did not have to change when
 * the data source did.
 */

export const GRADES = ["A", "B", "C"] as const;
export type Grade = (typeof GRADES)[number];

/**
 * Categories and tags are lookup tables in the database now, so these are plain
 * strings rather than the closed unions they were — staff can add a seventh
 * category without a deploy, and the site has to render whatever comes back.
 */
export type Category = string;
export type Tag = string;

export type Equipment = {
  slug: string;
  title: string;
  brand: string;
  category: Category;
  /** What we're asking, in rands. */
  price: number;
  /** Comparable new price, for the saving anchor. Omit if we can't back it up. */
  retailPrice?: number;
  /** A–C, mirrors items.condition_grade */
  grade: Grade;
  capacity: string;
  power: string;
  tags: Tag[];
  /** First entry is the card image. */
  images: string[];
  description: string;
  /** What the workshop actually replaced — the proof behind the grade. */
  workshopNotes: string[];
  /** width × depth × height, in millimetres. */
  dimensionsMm: [number, number, number];
  weightKg: number;
  /** Sold units stay listed with a badge until a human unpublishes them. */
  sold?: boolean;
  /** Surfaced in the highlighted row above the catalogue. */
  featured?: boolean;
};

/**
 * One slot in the detail-page gallery.
 *
 * Photos and video share the strip rather than sitting in separate sections —
 * a walkaround clip of a fridge running is the same kind of evidence as a photo
 * of it, and burying it under the specs is how it goes unwatched. `Equipment.images`
 * above stays photos-only on purpose: it feeds cards, the search overlay and the
 * OG tag, none of which can render a video.
 */
export type GalleryMedia = {
  kind: "photo" | "video";
  url: string;
};

/** The filter vocabulary, derived from the database rather than hardcoded. */
export type CategoryMeta = {
  name: string;
  icon: string;
  blurb: string;
  count: number;
};

export type Vocabulary = {
  categories: CategoryMeta[];
  tags: string[];
};

/**
 * Related stock: same category first, then anything in a similar price bracket,
 * so a page always fills its row even in a thin category.
 */
export function relatedTo(
  stock: readonly Equipment[],
  item: Equipment,
  limit = 3
): Equipment[] {
  const others = stock.filter((candidate) => candidate.slug !== item.slug);
  const sameCategory = others.filter((c) => c.category === item.category);
  const byPrice = others
    .filter((c) => c.category !== item.category)
    .sort((a, b) => Math.abs(a.price - item.price) - Math.abs(b.price - item.price));
  return [...sameCategory, ...byPrice].slice(0, limit);
}

export const WARRANTY_MONTHS = 6;

/** Light items go on a courier; anything heavy is delivered or collected. */
export function deliveryFor(item: Equipment) {
  return item.weightKg > 0 && item.weightKg <= 30
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

export const PRICE_BANDS = [
  { id: "under-5k", label: "Under R5 000", min: 0, max: 5000 },
  { id: "5k-15k", label: "R5 000 – R15 000", min: 5000, max: 15000 },
  { id: "15k-50k", label: "R15 000 – R50 000", min: 15000, max: 50000 },
  { id: "over-50k", label: "Over R50 000", min: 50000, max: Infinity },
] as const;
export type PriceBandId = (typeof PRICE_BANDS)[number]["id"];

/**
 * R42 500.
 *
 * Worth knowing, because it looks like a bug: `toLocaleString("en-ZA")` groups
 * with a NON-BREAKING space, not a comma, so the `.replace(/,/g, " ")` this
 * helper used to carry never matched anything. The nbsp was always what shipped
 * — and it is the better character, because it stops a price wrapping across
 * two lines. Kept deliberately.
 */
export const rands = (amount: number) => `R${amount.toLocaleString("en-ZA")}`;

export const mm = (value: number) => `${value.toLocaleString("en-ZA")} mm`;
