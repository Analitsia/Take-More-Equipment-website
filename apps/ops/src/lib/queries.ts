import { supabase } from "./supabase";
import { reportError } from "@takemore/observability";
import type { ConditionGrade, ItemStatus } from "@takemore/core";
import type { MediaRef } from "./media";

/**
 * Reads for the ops app.
 *
 * Everything here goes through the staff client, so RLS decides what comes
 * back. A staff member querying costs gets an empty list rather than an error,
 * which is why the UI checks the role before rendering a costs panel at all —
 * an empty panel would read as "this item cost nothing".
 *
 * ── Why `orEmpty` exists ──────────────────────────────────────────────────
 *
 * Several of these used to be `const { data } = await client...` with the error
 * simply not destructured, then `data ?? []`. That reads as tolerance, but it
 * conflates two very different situations: "RLS says you may not see any of
 * these" and "the query failed". Both rendered as an empty panel.
 *
 * In an ERP that is the worst class of bug available. A manager opens Money,
 * reads a margin of R0 off a failed query, and believes it. Nothing anywhere
 * said otherwise — not the screen, not the logs.
 *
 * So: still return the empty list, because a page that renders beats a page
 * that 500s. But say so somewhere. Pages where the distinction changes a
 * decision — Money in particular — also show the reader that a query failed.
 */

const orEmpty = <T>(
  where: string,
  result: { data: T[] | null; error: { message: string } | null }
): T[] => {
  if (result.error) reportError(result.error, { where });
  return result.data ?? [];
};

export type ItemRow = {
  id: string;
  sku: string;
  slug: string;
  title: string;
  brand: string | null;
  status: ItemStatus;
  condition_grade: ConditionGrade | null;
  list_price_cents: number | null;
  published_at: string | null;
  featured: boolean;
  created_at: string;
  location_code: string | null;
  category: { name: string; slug: string } | null;
  media: MediaRef[];
};

/**
 * `kind` and `position` are load-bearing, not padding. A list picks the cover
 * photograph with coverImage(), which needs `kind` to skip clips — the image
 * transformer refuses an mp4 — and `position` to honour the order the workshop
 * arranged the photos in. Selecting neither is what made every thumbnail here a
 * coin toss.
 */
const ITEM_LIST_SELECT = `
  id, sku, slug, title, brand, status, condition_grade, list_price_cents,
  published_at, featured, created_at, location_code,
  category:categories(name, slug),
  media:item_media(kind, storage_path, external_url, position)
`;

export async function listItems(): Promise<ItemRow[]> {
  const client = await supabase();
  const { data, error } = await client
    .from("items")
    .select(ITEM_LIST_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ItemRow[];
}

export async function getItem(id: string) {
  const client = await supabase();
  const { data, error } = await client
    .from("items")
    .select(
      `*, category:categories(id, name, slug),
       media:item_media(id, kind, storage_path, external_url, position, alt_text),
       tags:item_tags(tag_id)`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * How many of the homepage's highlight slots are spoken for.
 *
 * Counts drafts as well as live stock, because that is what `featured` means: a
 * slot held, not a card currently on the site. A worker can claim one while the
 * machine is still being photographed, and the database counts it the same way
 * — see the trigger in 20260811100000_featured_ceiling.sql.
 *
 * `head: true` so this is a count and not twelve rows nobody reads.
 */
export async function getFeaturedCount(): Promise<number> {
  const client = await supabase();
  const { count } = await client
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("featured", true)
    .is("deleted_at", null);
  return count ?? 0;
}

export async function getCategories() {
  const client = await supabase();
  const { data } = await client
    .from("categories")
    .select("id, name, slug, icon")
    .eq("active", true)
    .order("position");
  return data ?? [];
}

/**
 * Every subcategory, not just the ones under the item's current category.
 *
 * The editor filters them client-side as the category changes, so switching a
 * machine from Cooking to Refrigeration repopulates the second dropdown without
 * a round trip. There are eighteen rows; fetching them all is cheaper than the
 * request that would fetch the right six.
 */
export async function getSubcategories() {
  const client = await supabase();
  const { data } = await client
    .from("subcategories")
    .select("id, name, slug, category_id")
    .eq("active", true)
    .order("position");
  return data ?? [];
}

export async function getTags() {
  const client = await supabase();
  const { data } = await client
    .from("tags")
    .select("id, name, slug")
    .eq("active", true)
    .order("position");
  return data ?? [];
}

/** Empty for staff, by policy — callers must check the role before rendering. */
export async function getCosts(itemId: string) {
  const client = await supabase();
  return orEmpty(
    "queries/getCosts",
    await client
      .from("item_costs")
      .select("id, kind, amount_cents, note, incurred_on")
      .eq("item_id", itemId)
      .order("incurred_on", { ascending: false })
  );
}

export async function getEconomics(itemId: string) {
  const client = await supabase();
  const { data, error } = await client
    .from("item_economics")
    .select("total_cost_cents, margin_cents, margin_percent, days_to_sale")
    .eq("item_id", itemId)
    .maybeSingle();
  if (error) reportError(error, { where: "queries/getEconomics" });
  return data;
}

export async function getActivity(itemId: string) {
  const client = await supabase();
  return orEmpty(
    "queries/getActivity",
    await client
      .from("activity_log")
      .select("id, action, summary, created_at")
      .eq("entity_id", itemId)
      .order("created_at", { ascending: false })
      .limit(20)
  );
}

/**
 * The most recent run of a scheduled job, for the dashboard strip.
 *
 * Returns null both when nothing has ever run and when the read failed — the
 * caller renders the same "we do not know" state for both, because from the
 * reader's point of view they are the same situation.
 */
export async function getLastCronRun(job = "stock_match") {
  const client = await supabase();
  const { data, error } = await client
    .from("cron_runs")
    .select("started_at, finished_at, ok, result, error")
    .eq("job", job)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) reportError(error, { where: "queries/getLastCronRun" });
  return data;
}

/**
 * The whole activity log, newest first — the ops-wide timeline.
 *
 * activity_log_recent_idx already exists for exactly this query. The table is
 * append-only and written by a trigger, so this is a pure read and there is no
 * corresponding write anywhere in the app.
 */
export async function getRecentActivity(limit = 100) {
  const client = await supabase();
  return orEmpty(
    "queries/getRecentActivity",
    await client
      .from("activity_log")
      .select("id, entity, entity_id, action, summary, created_at, actor_id")
      .order("created_at", { ascending: false })
      .limit(limit)
  );
}

/** user_id → display name, for putting a person's name against a log line. */
export async function getStaffNames(): Promise<Map<string, string>> {
  const client = await supabase();
  const rows = orEmpty(
    "queries/getStaffNames",
    await client.from("staff_profiles").select("user_id, full_name")
  );
  return new Map(rows.map((row) => [row.user_id, row.full_name]));
}
