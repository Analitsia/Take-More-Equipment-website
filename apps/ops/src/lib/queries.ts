import { supabase } from "./supabase";
import type { ConditionGrade, ItemStatus } from "@takemore/core";

/**
 * Reads for the ops app.
 *
 * Everything here goes through the staff client, so RLS decides what comes
 * back. A staff member querying costs gets an empty list rather than an error,
 * which is why the UI checks the role before rendering a costs panel at all —
 * an empty panel would read as "this item cost nothing".
 */

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
  media: { storage_path: string | null; external_url: string | null }[];
};

const ITEM_LIST_SELECT = `
  id, sku, slug, title, brand, status, condition_grade, list_price_cents,
  published_at, featured, created_at, location_code,
  category:categories(name, slug),
  media:item_media(storage_path, external_url)
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

export async function getCategories() {
  const client = await supabase();
  const { data } = await client
    .from("categories")
    .select("id, name, slug, icon")
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
  const { data } = await client
    .from("item_costs")
    .select("id, kind, amount_cents, note, incurred_on")
    .eq("item_id", itemId)
    .order("incurred_on", { ascending: false });
  return data ?? [];
}

export async function getEconomics(itemId: string) {
  const client = await supabase();
  const { data } = await client
    .from("item_economics")
    .select("total_cost_cents, margin_cents, margin_percent, days_to_sale")
    .eq("item_id", itemId)
    .maybeSingle();
  return data;
}

export async function getActivity(itemId: string) {
  const client = await supabase();
  const { data } = await client
    .from("activity_log")
    .select("id, action, summary, created_at")
    .eq("entity_id", itemId)
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}
