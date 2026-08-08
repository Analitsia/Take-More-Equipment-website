"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase, requireStaff } from "@/lib/supabase";
import { revalidateStorefront } from "@/lib/storefront";
import { STAGES, type CostKind, type ItemStatus } from "@takemore/core";

/**
 * Every mutation the ops app makes.
 *
 * These are thin on purpose. The rules — legal status moves, the publish gate,
 * SKU and slug generation, who may read a cost — all live in the database, so
 * an action's job is to pass the intent along and report what happened. Nothing
 * here re-implements a rule, because a second copy of a rule is a rule that can
 * disagree with itself.
 */

export type ActionResult =
  | { ok: true; notice?: string }
  | { ok: false; error: string };

/** Postgres error text is written for developers; these are for a warehouse. */
const humanise = (message: string): string => {
  if (message.includes("Cannot move an item")) return message;
  if (message.includes("before it can be published")) return message;
  if (message.includes("duplicate key") && message.includes("slug"))
    return "Another item already uses that name.";
  if (message.includes("permission denied") || message.includes("row-level security"))
    return "You don't have permission to do that.";
  return message;
};

export async function createDraft(): Promise<never> {
  await requireStaff();
  const client = await supabase();

  // A draft is created empty and immediately opened for editing, so the first
  // thing a worker does is photograph rather than fill in a form header. The
  // row exists from that moment, which is what makes autosave possible.
  // Spelled out rather than `.insert({})` — an empty object makes the generated
  // client pick its array overload, and the placeholder title is what the
  // column default would have supplied anyway.
  const { data, error } = await client
    .from("items")
    .insert({ title: "Untitled item" })
    .select("id")
    .single();

  if (error) throw new Error(humanise(error.message));

  revalidatePath("/items");
  redirect(`/items/${data.id}`);
}

export type ItemPatch = {
  title?: string;
  brand?: string | null;
  model?: string | null;
  category_id?: string | null;
  subcategory_id?: string | null;
  condition_grade?: "A" | "B" | "C" | null;
  description?: string | null;
  workshop_notes?: string[];
  capacity?: string | null;
  power?: string | null;
  width_mm?: number | null;
  depth_mm?: number | null;
  height_mm?: number | null;
  weight_kg?: number | null;
  list_price_cents?: number | null;
  retail_price_cents?: number | null;
  location_code?: string | null;
  featured?: boolean;
};

export async function updateItem(id: string, patch: ItemPatch): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client.from("items").update(patch).eq("id", id);
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${id}`);
  revalidatePath("/items");
  // A published item that changes is a storefront change.
  await revalidateStorefront(id);
  return { ok: true };
}

/**
 * Set the stage — which also decides whether the machine is on the website.
 *
 * One control instead of two. Publication used to be a separate switch a human
 * had to remember to flip, so sold units sat on the site and repaired ones sat
 * off it; the stage now carries that decision with it.
 *
 * The publish write is SEPARATE from the status write, deliberately, and the
 * order is load-bearing. The publish gate lives in
 * items_enforce_publish_requirements, which Postgres fires BEFORE
 * items_enforce_status_transition — so a published_at set from inside the status
 * trigger would sail straight past the check meant to validate it, and a machine
 * with no photo could reach the website by way of a stage button.
 *
 * Doing it as its own write means the gate runs properly, and means an item too
 * incomplete to publish still CHANGES STAGE: the status has already committed,
 * and the caller is told what stopped the rest rather than losing the whole
 * action. Re-tapping the stage it is already on retries the publish, which is
 * the path back once the missing photo or price has been added.
 */
export async function setStage(id: string, status: ItemStatus): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const stage = STAGES.find((s) => s.status === status);
  if (!stage) return { ok: false, error: "That is not a stage an item can be in." };

  const { error } = await client.from("items").update({ status }).eq("id", id);
  if (error) return { ok: false, error: humanise(error.message) };

  const { data: after } = await client
    .from("items")
    .select("published_at")
    .eq("id", id)
    .maybeSingle();
  const isLive = !!after?.published_at;

  let notice: string | undefined;

  if (stage.live && !isLive) {
    const { error: publishError } = await client
      .from("items")
      .update({ published_at: new Date().toISOString() })
      .eq("id", id);

    notice = publishError
      ? `Moved to ${stage.label}, but it is not on the website yet — ${humanise(publishError.message).toLowerCase()}`
      : `${stage.label} — now on the website.`;
  } else if (!stage.live && isLive) {
    const { error: hideError } = await client
      .from("items")
      .update({ published_at: null })
      .eq("id", id);

    notice = hideError
      ? `Moved to ${stage.label}, but it could not be taken off the website: ${humanise(hideError.message)}`
      : `${stage.label} — taken off the website.`;
  }

  revalidatePath(`/items/${id}`);
  revalidatePath("/items");
  revalidatePath("/board");
  await revalidateStorefront(id);
  return { ok: true, notice };
}

/**
 * Publish and unpublish.
 *
 * Separate from status entirely — that independence is what lets a sold machine
 * keep its page with a SOLD badge until a human decides otherwise. The gate is
 * a database trigger, so an incomplete item fails here with the reason.
 */
export async function setPublished(id: string, published: boolean): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("items")
    .update({ published_at: published ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${id}`);
  revalidatePath("/items");
  await revalidateStorefront(id);
  return { ok: true };
}

export async function setTags(id: string, tagIds: string[]): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error: clearError } = await client.from("item_tags").delete().eq("item_id", id);
  if (clearError) return { ok: false, error: humanise(clearError.message) };

  if (tagIds.length) {
    const { error } = await client
      .from("item_tags")
      .insert(tagIds.map((tag_id) => ({ item_id: id, tag_id })));
    if (error) return { ok: false, error: humanise(error.message) };
  }

  revalidatePath(`/items/${id}`);
  await revalidateStorefront(id);
  return { ok: true };
}

/**
 * Costs go in through the RPC, never a plain insert.
 *
 * PostgREST defaults to `Prefer: return=representation`, which makes an insert
 * also a select — and a staff account may write costs but not read them, so a
 * direct insert comes back as a 403 that looks exactly like a broken policy.
 * The RPC returns void and sidesteps it.
 */
export async function recordCost(
  itemId: string,
  kind: CostKind,
  amountCents: number,
  note?: string
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client.rpc("record_item_cost", {
    p_item_id: itemId,
    p_kind: kind,
    p_amount_cents: amountCents,
    // Omitted rather than nulled — the RPC's optional arguments are typed as
    // `string | undefined`, and the SQL default already coalesces.
    p_note: note,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

/**
 * The two fixed cost boxes — auction and workshop.
 *
 * Separate from recordCost() because these are a VALUE, not a ledger entry: the
 * field is re-blurred every time a manager corrects a typo, and appending a row
 * each time would turn one auction price into six. The RPC keeps exactly one row
 * per kind, and clearing the box deletes it rather than storing a zero — a
 * stored R0 reads as a machine that was free.
 *
 * Returns void like record_item_cost() and for the same reason: a staff account
 * may write costs and may not read them, so anything that returns the row would
 * come back as a 403 that looks exactly like a broken policy.
 */
export async function setItemCost(
  itemId: string,
  kind: CostKind,
  amountCents: number | null
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client.rpc("set_item_cost", {
    p_item_id: itemId,
    p_kind: kind,
    // An empty box and a zero mean the same thing to the RPC — "there is no
    // such cost" — and it deletes the row rather than storing a zero either way.
    p_amount_cents: amountCents ?? 0,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

export async function deleteCost(itemId: string, costId: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client.from("item_costs").delete().eq("id", costId);
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

/** Called after the browser has put the file in Storage. */
export async function recordMedia(
  itemId: string,
  storagePath: string,
  kind: "photo" | "video",
  dimensions?: { width?: number; height?: number; duration?: number }
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { data: last } = await client
    .from("item_media")
    .select("position")
    .eq("item_id", itemId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await client.from("item_media").insert({
    item_id: itemId,
    kind,
    storage_path: storagePath,
    position: (last?.position ?? -1) + 1,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    duration_seconds: dimensions?.duration ?? null,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/items/${itemId}`);
  await revalidateStorefront(itemId);
  return { ok: true };
}

export async function deleteMedia(itemId: string, mediaId: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { data: media } = await client
    .from("item_media")
    .select("storage_path")
    .eq("id", mediaId)
    .maybeSingle();

  const { error } = await client.from("item_media").delete().eq("id", mediaId);
  if (error) return { ok: false, error: humanise(error.message) };

  // Best effort. An orphaned object costs a few cents of storage; a failed
  // delete that blocks the UI costs a worker's afternoon.
  if (media?.storage_path) {
    await client.storage.from("item-media").remove([media.storage_path]);
  }

  revalidatePath(`/items/${itemId}`);
  await revalidateStorefront(itemId);
  return { ok: true };
}

/** Reorder by rewriting positions. The lowest-positioned photo is the card image. */
export async function reorderMedia(
  itemId: string,
  orderedIds: string[]
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  for (const [index, id] of orderedIds.entries()) {
    const { error } = await client
      .from("item_media")
      .update({ position: index })
      .eq("id", id);
    if (error) return { ok: false, error: humanise(error.message) };
  }

  revalidatePath(`/items/${itemId}`);
  await revalidateStorefront(itemId);
  return { ok: true };
}

export async function softDeleteItem(id: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  // Soft, always: an item that was live has been indexed and linked to.
  const { error } = await client
    .from("items")
    .update({ deleted_at: new Date().toISOString(), published_at: null })
    .eq("id", id);

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/items");
  await revalidateStorefront(id);
  return { ok: true };
}
