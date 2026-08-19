"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase, requireStaff } from "@/lib/supabase";
import { createAdminClient } from "@takemore/db/admin";
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

  // A machine that has just gone on sale is the moment to check who has been
  // waiting for one. Best effort and after the fact: matching is a suggestion,
  // and a failure here must not make the stage change look like it failed.
  // Nothing is lost if it does — run_stock_match() sweeps nightly, and the
  // unique index means the two paths cannot double up.
  if (status === "listed") {
    const { data: matched, error: matchError } = await client.rpc("match_item_to_leads", {
      p_item_id: id,
    });
    if (matchError) {
      console.warn("match_item_to_leads failed (the nightly sweep will catch it):", matchError.message);
    } else if (matched && matched > 0) {
      notice = `${notice ? `${notice} ` : ""}${matched} ${matched === 1 ? "person was" : "people were"} looking for one — see Outreach.`;
      revalidatePath("/outreach");
    }
  }

  revalidatePath(`/items/${id}`);
  revalidatePath("/items");
  revalidatePath("/board");
  // The Dashboard reads every stage count and, once a machine reaches `sold`,
  // every margin and rotation number on the page. It used to be a small "Today"
  // that a stale render cost nothing; it is now the page this change is most
  // visible on.
  revalidatePath("/");
  await revalidateStorefront(id);
  return { ok: true, notice };
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

/**
 * Delete an item: off the website, out of the stock list, in one action.
 *
 * Soft, always. Not as a hedge — as the only version of this that is safe to
 * offer. A hard DELETE would take the item's costs and its activity log with it
 * (both cascade), orphan any outreach that named the machine, and free the slug
 * for the next item to claim — so a URL a customer has in a WhatsApp thread
 * would one day answer with a different fryer. `deleted_at` costs a row and
 * avoids all four.
 *
 * What a worker sees is a real delete regardless, because every read filters it:
 * the stock list and getItem() exclude it, the public views require
 * `deleted_at is null`, and the storefront loses it twice over since
 * `published_at` is cleared in the same statement. Nothing in the app can reach
 * it afterwards — the row is a record, not a hiding place.
 *
 * `.is("deleted_at", null)` makes it idempotent: a double tap on a slow
 * connection matches nothing the second time rather than re-stamping the
 * timestamp and writing a second 'deleted' line into the history.
 */
/**
 * A machine draft nobody ever filled in does not stay on the books.
 *
 * The same rule the till uses for an order nobody finished, applied here:
 *
 *   nothing was ever recorded  →  discarded, and no trace is kept
 *   anything was recorded      →  soft-deleted, and the record stays for ever
 *
 * Pressing "New item" creates the row immediately — that is what makes the
 * autosave-as-you-photograph flow possible, and it is right. The cost of it is
 * that a mis-tap, a customer interrupting, or a phone going to sleep leaves an
 * "Untitled item" in the stock list, and soft-deleting those was preserving a
 * record of nothing while still counting against the eye of whoever scrolls the
 * deleted list later.
 *
 * ── What counts as "nothing was recorded" ─────────────────────────────────
 *
 * All five, and they are checked HERE rather than trusted from the browser:
 *
 *   never published        no customer ever saw it
 *   no photograph          nobody walked over and photographed it
 *   no cost line           no money was ever attached to it
 *   not on an order        nobody has quoted or sold it
 *   in the workshop or
 *   for sale               not reserved, not sold — those are order states,
 *                          and this is the belt to the order check's braces
 *
 * A row that fails any of them is soft-deleted exactly as before: what it cost
 * and what was done to it stay in the record, which is the whole argument of
 * 20260811090000_soft_delete_is_a_delete.sql.
 *
 * The admin key is here for the same reason it is in discardOrder(): the only
 * DELETE policy on items is owner-only, and the person who needs to undo a
 * mis-tap is whoever made it. The five conditions above are what stands in for
 * that policy, and they are stricter than it.
 */
export async function deleteItem(
  id: string
): Promise<ActionResult & { discarded?: boolean }> {
  await requireStaff();
  const client = await supabase();

  const { data: item, error: readError } = await client
    .from("items")
    .select("id, sku, title, status, published_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError) return { ok: false, error: humanise(readError.message) };
  if (!item) return { ok: false, error: "That machine is not there any more." };

  const [media, costs, lines] = await Promise.all([
    client.from("item_media").select("id", { count: "exact", head: true }).eq("item_id", id),
    client.from("item_costs").select("id", { count: "exact", head: true }).eq("item_id", id),
    client.from("order_lines").select("id", { count: "exact", head: true }).eq("item_id", id),
  ]);

  const untouched =
    !item.published_at &&
    (media.count ?? 0) === 0 &&
    (costs.count ?? 0) === 0 &&
    (lines.count ?? 0) === 0 &&
    (item.status === "refurbishing" || item.status === "listed");

  if (untouched) {
    const admin = createAdminClient();

    // The status guard is repeated on the statement itself. The read above was
    // a moment ago, and in that moment somebody else could have put this very
    // machine on an order from another phone — in which case this matches
    // nothing and the fall-through below soft-deletes it instead.
    const { data: gone, error } = await admin
      .from("items")
      .delete()
      .eq("id", id)
      .in("status", ["refurbishing", "listed"])
      .is("published_at", null)
      .select("id");

    if (error) return { ok: false, error: humanise(error.message) };

    if (gone?.length) {
      // Its own lines on the timeline go with it, for the reason discardOrder()
      // gives: this row recorded nothing, and a code on the team's timeline
      // that resolves to no machine reads as a bug rather than as history.
      await admin.from("activity_log").delete().eq("entity", "item").eq("entity_id", id);

      revalidatePath("/items");
      revalidatePath("/board");
      revalidatePath("/");
      revalidatePath("/team");
      return { ok: true, discarded: true, notice: `${item.sku} is gone.` };
    }
  }

  return softDeleteItem(id);
}

export async function softDeleteItem(id: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("items")
    .update({ deleted_at: new Date().toISOString(), published_at: null })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: humanise(error.message) };

  // Every surface that counts stock. The dashboard and the board both read from
  // the same undeleted set, and a machine that lingers on either after being
  // deleted is the bug this is most likely to grow.
  revalidatePath("/items");
  revalidatePath("/board");
  revalidatePath("/");
  revalidatePath("/team");
  await revalidateStorefront(id);
  return { ok: true };
}
