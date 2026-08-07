import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@takemore/db";
import type { Equipment, Grade, Vocabulary } from "@/data/equipment";

/**
 * The storefront's data source.
 *
 * Reads `public_items`, which is filtered to published, undeleted stock and
 * carries no cost columns — the anonymous key cannot reach cost data at all, by
 * construction rather than by this file remembering not to select it.
 *
 * Results are cached and tagged, not re-fetched per request. The ops app pings
 * /api/revalidate when stock changes, which drops these tags; the time-based
 * expiry underneath is the safety net for a webhook that never arrives.
 */

export const STOCK_TAG = "stock";
const REVALIDATE_SECONDS = 300;

const SUPABASE_PUBLIC_PREFIX = "/storage/v1/object/public/item-media/";
const SUPABASE_RENDER_PREFIX = "/storage/v1/render/image/public/item-media/";

/**
 * One original per photo, three sizes on the way out. `card` is what the grid
 * and the search overlay use; the detail gallery asks for `full`.
 */
function imageUrl(
  media: { storage_path: string | null; external_url: string | null },
  width = 1200
): string | null {
  if (media.external_url) return media.external_url;
  if (!media.storage_path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}${SUPABASE_RENDER_PREFIX}${media.storage_path}?width=${width}&quality=78&resize=cover`;
}

type PublicItemRow = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  category_name: string | null;
  condition_grade: Grade | null;
  description: string | null;
  workshop_notes: string[] | null;
  capacity: string | null;
  power: string | null;
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
  weight_kg: number | null;
  list_price_cents: number | null;
  retail_price_cents: number | null;
  sale_price_cents: number | null;
  sold: boolean | null;
  featured: boolean | null;
  tag_slugs: string[] | null;
};

/**
 * The generator types every view column as nullable, because a view's
 * nullability is genuinely unknowable to it. Narrowing happens here, once,
 * rather than with a `!` at every call site — and the defaults are chosen so a
 * half-filled row degrades into a dull card rather than a crash.
 */
function toEquipment(row: PublicItemRow, images: string[]): Equipment {
  const sold = row.sold ?? false;
  return {
    slug: row.slug,
    title: row.title,
    brand: row.brand ?? "",
    category: row.category_name ?? "Uncategorised",
    // A sold unit shows what it actually went for; everything else shows the ask.
    price: Math.round(((sold ? row.sale_price_cents : null) ?? row.list_price_cents ?? 0) / 100),
    retailPrice: row.retail_price_cents ? Math.round(row.retail_price_cents / 100) : undefined,
    grade: row.condition_grade ?? "B",
    capacity: row.capacity ?? "—",
    power: row.power ?? "—",
    tags: row.tag_slugs ?? [],
    images,
    description: row.description ?? "",
    workshopNotes: row.workshop_notes ?? [],
    dimensionsMm: [row.width_mm ?? 0, row.depth_mm ?? 0, row.height_mm ?? 0],
    weightKg: Number(row.weight_kg ?? 0),
    sold,
    featured: row.featured ?? false,
  };
}

async function fetchStock(): Promise<Equipment[]> {
  const client = createPublicClient();

  const { data: items, error } = await client
    .from("public_items")
    .select("*")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false });

  if (error) {
    // A storefront that 500s because the database hiccuped is worse than one
    // that shows an empty catalogue for a few minutes.
    console.error("stock query failed:", error.message);
    return [];
  }

  const rows = (items ?? []) as unknown as PublicItemRow[];
  if (rows.length === 0) return [];

  const { data: media } = await client
    .from("public_item_media")
    .select("item_id, kind, storage_path, external_url, position")
    .in(
      "item_id",
      rows.map((r) => r.id)
    )
    .order("position");

  const byItem = new Map<string, string[]>();
  for (const m of media ?? []) {
    if ((m as any).kind !== "photo") continue;
    const url = imageUrl(m as any);
    if (!url) continue;
    const list = byItem.get((m as any).item_id) ?? [];
    list.push(url);
    byItem.set((m as any).item_id, list);
  }

  return rows.map((row) => toEquipment(row, byItem.get(row.id) ?? []));
}

/** Cached across requests. Invalidated by the ops app through /api/revalidate. */
export const getStock = unstable_cache(fetchStock, ["stock"], {
  tags: [STOCK_TAG],
  revalidate: REVALIDATE_SECONDS,
});

async function fetchVocabulary(stock: Equipment[]): Promise<Vocabulary> {
  const client = createPublicClient();

  const { data: categories } = await client
    .from("public_categories")
    .select("name, icon, blurb, position")
    .order("position");

  const { data: tags } = await client.from("tags").select("name, slug, position").order("position");

  // Counts come from the stock we already have rather than the view's own
  // count, so the tile and the catalogue can never disagree about how many
  // fryers there are.
  const counts = new Map<string, number>();
  for (const item of stock) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);

  return {
    categories: (categories ?? []).map((c: any) => ({
      name: c.name,
      icon: c.icon ?? "solar:box-linear",
      blurb: c.blurb ?? "",
      count: counts.get(c.name) ?? 0,
    })),
    // Items carry tag SLUGS, so the filter vocabulary has to be slugs too.
    tags: (tags ?? []).map((t: any) => t.slug),
  };
}

export const getVocabulary = unstable_cache(fetchVocabulary, ["vocabulary"], {
  tags: [STOCK_TAG],
  revalidate: REVALIDATE_SECONDS,
});

export async function getBySlug(slug: string): Promise<Equipment | undefined> {
  const stock = await getStock();
  return stock.find((item) => item.slug === slug);
}

/** Full-size images for the detail gallery. */
export async function getGallery(slug: string): Promise<string[]> {
  const client = createPublicClient();
  const { data: item } = await client
    .from("public_items")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!item) return [];

  const { data: media } = await client
    .from("public_item_media")
    .select("kind, storage_path, external_url, position")
    .eq("item_id", (item as any).id)
    .order("position");

  return (media ?? [])
    .filter((m: any) => m.kind === "photo")
    .map((m: any) => imageUrl(m, 1600))
    .filter((url): url is string => !!url);
}
