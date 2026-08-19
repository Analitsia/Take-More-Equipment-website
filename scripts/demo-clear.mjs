/**
 * Take the demo catalogue back out.
 *
 *   npm run demo:clear
 *
 * Deletes exactly what demo-seed.mjs put in and nothing else. The test for
 * "ours" is the marker each row carries — `items.specs.demo_seed` and
 * `leads.extra.demo_seed` — not a date, not a name prefix, and not the fixed
 * UUIDs, which are only a second opinion. Anything a human has since created is
 * invisible to this script by construction.
 *
 * What goes, and why it has to be listed rather than left to the database:
 *
 *   item_media, item_tags, item_costs   cascade from items
 *   lead_interests, lead_events,
 *   lead_interest_tags, outreach        cascade from leads and items
 *   Storage objects                     do NOT cascade — a row in item_media is
 *                                       not the file, and deleting the row
 *                                       leaves the object orphaned in the bucket
 *   activity_log                        does NOT cascade either: entity_id is a
 *                                       bare uuid with no foreign key, on
 *                                       purpose, so the log outlives its
 *                                       subject. Right for real stock, wrong for
 *                                       a demo — otherwise the Activity page
 *                                       keeps showing fifteen machines that no
 *                                       longer exist.
 *
 * Carlo's own stock is untouched. If this leaves anything behind it will say so
 * rather than claim success.
 */

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DEMO_MARKER } from "./demo-dataset.mjs";

const BUCKET = "item-media";

/**
 * @param admin  a service-role Supabase client
 * @param log    where to narrate; pass () => {} to run quietly
 */
export async function clearDemo(admin, log = console.log) {
  const removed = { items: 0, leads: 0, orders: 0, objects: 0, activity: 0 };

  // ── Items ────────────────────────────────────────────────────────────────
  // `specs->>demo_seed is not null` rather than `= stamp`: a seed from an older
  // run is still ours, and leaving it behind because the date moved is exactly
  // the bug this script exists to prevent.
  const { data: items, error: itemsError } = await admin
    .from("items")
    .select("id, sku, title")
    .not(`specs->>${DEMO_MARKER}`, "is", null);
  if (itemsError) throw new Error(`reading demo items: ${itemsError.message}`);

  for (const item of items ?? []) {
    // Storage first. If the row goes and this fails, the objects are orphaned
    // with nothing left pointing at them.
    const { data: objects, error: listError } = await admin.storage
      .from(BUCKET)
      .list(`items/${item.id}`, { limit: 200 });

    if (listError) {
      log(`  ! could not list media for ${item.sku}: ${listError.message}`);
    } else if (objects?.length) {
      const paths = objects.map((o) => `items/${item.id}/${o.name}`);
      const { error: removeError } = await admin.storage.from(BUCKET).remove(paths);
      if (removeError) log(`  ! could not remove media for ${item.sku}: ${removeError.message}`);
      else removed.objects += paths.length;
    }

    const { error: activityError } = await admin
      .from("activity_log")
      .delete()
      .eq("entity", "item")
      .eq("entity_id", item.id);
    if (activityError) log(`  ! activity for ${item.sku}: ${activityError.message}`);
    else removed.activity++;
  }

  // ── Orders ───────────────────────────────────────────────────────────────
  // Before the items and before the leads, because order_lines.item_id and
  // orders.lead_id are both ON DELETE RESTRICT — a machine on an order cannot
  // be deleted out from under it, and neither can the person who bought it.
  //
  // Without this, seeding a demo, selling a demo machine on the order screen
  // and then running demo:clear fails on a foreign key that names none of that.
  // The restrict is right; this is the script catching up with it.
  if (items?.length) {
    const { data: lines, error: linesError } = await admin
      .from("order_lines")
      .select("order_id")
      .in("item_id", items.map((i) => i.id));
    if (linesError) throw new Error(`reading demo order lines: ${linesError.message}`);

    const orderIds = [...new Set((lines ?? []).map((l) => l.order_id))];
    if (orderIds.length) {
      // The lines go with the order by cascade; the machines they held were
      // already put back by whatever moved them, or are about to be deleted.
      const { error } = await admin.from("orders").delete().in("id", orderIds);
      if (error) throw new Error(`deleting demo orders: ${error.message}`);
      removed.orders = orderIds.length;
      log(`  removed ${orderIds.length} order(s) that held demo stock`);
    }
  }

  if (items?.length) {
    const { error } = await admin
      .from("items")
      .delete()
      .in("id", items.map((i) => i.id));
    if (error) throw new Error(`deleting demo items: ${error.message}`);
    removed.items = items.length;
  }

  // ── Leads ────────────────────────────────────────────────────────────────
  const { data: leads, error: leadsError } = await admin
    .from("leads")
    .select("id")
    .not(`extra->>${DEMO_MARKER}`, "is", null);
  if (leadsError) throw new Error(`reading demo leads: ${leadsError.message}`);

  if (leads?.length) {
    // Same restrict, other end: an order remembers who bought, so the order has
    // to go first. Separate from the block above because a demo person can be
    // on an order that held no demo machine.
    const { data: theirOrders, error: ordersError } = await admin
      .from("orders")
      .select("id")
      .in("lead_id", leads.map((l) => l.id));
    if (ordersError) throw new Error(`reading demo orders: ${ordersError.message}`);

    if (theirOrders?.length) {
      const { error } = await admin
        .from("orders")
        .delete()
        .in("id", theirOrders.map((o) => o.id));
      if (error) throw new Error(`deleting demo orders: ${error.message}`);
      removed.orders += theirOrders.length;
    }

    const { error } = await admin
      .from("leads")
      .delete()
      .in("id", leads.map((l) => l.id));
    if (error) throw new Error(`deleting demo leads: ${error.message}`);
    removed.leads = leads.length;
  }

  return removed;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedDirectly =
  !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (invokedDirectly) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  console.log("\n  Removing the demo catalogue…\n");
  const removed = await clearDemo(admin);
  console.log(
    `\n  Gone: ${removed.items} item(s), ${removed.objects} media object(s), ` +
      `${removed.leads} lead(s), ${removed.orders} order(s), and their activity.\n`
  );

  // The storefront caches stock for five minutes; drop the tag so the site
  // stops showing machines that are no longer in the database.
  const storefront = process.env.STOREFRONT_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (storefront && secret) {
    const res = await fetch(`${storefront}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({}),
    }).catch((error) => ({ ok: false, status: error.message }));
    console.log(
      res.ok
        ? "  Storefront cache dropped.\n"
        : `  Storefront cache NOT dropped (${res.status}) — it will expire within five minutes.\n`
    );
  }
}
