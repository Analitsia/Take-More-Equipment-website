/**
 * Load the demo catalogue into the live database.
 *
 *   npm run demo:seed              build media, seed everything, drop the cache
 *   npm run demo:seed -- --skip-video     photos only (no ffmpeg needed)
 *
 * Read the header of demo-dataset.mjs first. It explains what this data is, why
 * the photographs go in as real Storage objects, and how to take it all out
 * again.
 *
 * ── Why this walks the real path instead of writing rows ──────────────────
 *
 * Every rule in this schema lives in a trigger, and a seed that inserts a
 * finished row goes around most of them. So this does what a worker does:
 * creates the machine in the workshop, attaches its photographs, and only then
 * moves it to a stage and puts it on the website. If the publish gate refuses
 * something, that is a real answer about the data and it is reported rather than
 * worked around.
 *
 * Two consequences worth knowing:
 *
 *   · The status trigger sees a null actor (the service key has no staff row),
 *     which it reads as "privileged" — see the comment in
 *     20260807090300_items.sql. Role checks are therefore NOT exercised here.
 *   · activity_log fills up as a side effect, which is the point: the Activity
 *     page has a history because the history actually happened.
 *
 * It is idempotent. The first thing it does is clear any previous demo rows, so
 * running it twice leaves one catalogue, not two.
 */

import { createClient } from "@supabase/supabase-js";
import { ITEMS, LEADS, DEMO_MARKER, DEMO_STAMP } from "./demo-dataset.mjs";
import { buildMediaFor, checkFfmpeg, readMedia } from "./demo-media.mjs";
import { clearDemo } from "./demo-clear.mjs";

const BUCKET = "item-media";
const skipVideo = process.argv.includes("--skip-video");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.\n" +
      "Run through npm (npm run demo:seed) so .env.local is loaded."
  );
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

const warnings = [];
const warn = (message) => {
  warnings.push(message);
  console.log(`  ${red("!")}  ${message}`);
};

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

async function lookup(table, columns = "id, slug") {
  const { data, error } = await admin.from(table).select(columns);
  if (error) throw new Error(`reading ${table}: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.slug, row.id]));
}

console.log("\n  Take More — demo catalogue\n");

if (!skipVideo) await checkFfmpeg();

const categories = await lookup("categories");
const subcategories = await lookup("subcategories");
const tags = await lookup("tags");
console.log(
  dim(
    `  ${categories.size} categories, ${subcategories.size} subcategories, ${tags.size} tags in the database.`
  )
);

/** Resolve a slug or fail loudly — a silent null here is a mis-filed machine. */
function id(map, slug, what) {
  if (slug === null || slug === undefined) return null;
  const found = map.get(slug);
  if (!found) throw new Error(`No ${what} with slug "${slug}". Reference data has changed.`);
  return found;
}

// ---------------------------------------------------------------------------
// Start from clean
// ---------------------------------------------------------------------------

const cleared = await clearDemo(admin, (m) => console.log(dim(`  ${m}`)));
if (cleared.items || cleared.leads) {
  console.log(
    dim(`  Cleared a previous seed: ${cleared.items} item(s), ${cleared.leads} lead(s).`)
  );
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

console.log("\n  Stock\n");

const seeded = [];

for (const item of ITEMS) {
  const [width, depth, height] = item.dims ?? [null, null, null];

  // Created in the workshop, which is where a machine that has just arrived
  // actually is, and where the four-stage model starts everything.
  const { error: insertError } = await admin.from("items").insert({
    id: item.id,
    title: item.title,
    brand: item.brand ?? null,
    model: item.model ?? null,
    category_id: id(categories, item.category, "category"),
    subcategory_id: id(subcategories, item.subcategory, "subcategory"),
    condition_grade: item.grade ?? null,
    description: item.description ?? null,
    workshop_notes: item.workshopNotes ?? [],
    capacity: item.capacity ?? null,
    power: item.power ?? null,
    width_mm: width,
    depth_mm: depth,
    height_mm: height,
    weight_kg: item.weight ?? null,
    list_price_cents: item.list ?? null,
    retail_price_cents: item.retail ?? null,
    status: "refurbishing",
    featured: item.featured ?? false,
    arrived_at: item.arrived,
    location_code: item.location ?? null,
    // The marker demo-clear.mjs deletes on. Neither app renders `specs`, so it
    // is invisible in the UI and unambiguous in SQL.
    specs: { [DEMO_MARKER]: DEMO_STAMP },
    created_at: `${item.arrived}T08:00:00+02:00`,
  });
  if (insertError) {
    warn(`${item.title}: ${insertError.message}`);
    continue;
  }

  // ── Media ──────────────────────────────────────────────────────────────
  const media = await buildMediaFor(item, { skipVideo });
  const mediaRows = [];

  for (const file of media) {
    const path = `items/${item.id}/${file.objectName}`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, await readMedia(file), { contentType: file.contentType, upsert: true });
    if (uploadError) {
      warn(`${item.title}: uploading ${file.objectName} — ${uploadError.message}`);
      continue;
    }
    mediaRows.push({
      item_id: item.id,
      kind: file.kind,
      storage_path: path,
      position: file.position,
      alt_text: file.altText,
    });
  }

  if (mediaRows.length) {
    const { error } = await admin.from("item_media").insert(mediaRows);
    if (error) warn(`${item.title}: recording media — ${error.message}`);
  }

  // ── Tags ───────────────────────────────────────────────────────────────
  if (item.tags?.length) {
    const { error } = await admin.from("item_tags").insert(
      item.tags.map((slug) => ({ item_id: item.id, tag_id: id(tags, slug, "tag") }))
    );
    if (error) warn(`${item.title}: tags — ${error.message}`);
  }

  // ── Costs ──────────────────────────────────────────────────────────────
  if (item.costs?.length) {
    const { error } = await admin.from("item_costs").insert(
      item.costs.map((cost) => ({
        item_id: item.id,
        kind: cost.kind,
        amount_cents: cost.amount,
        note: cost.note ?? null,
        labour_hours: cost.hours ?? null,
        incurred_on: item.arrived,
      }))
    );
    if (error) warn(`${item.title}: costs — ${error.message}`);
  }

  // ── Stage ──────────────────────────────────────────────────────────────
  // Separate from the insert so the transition trigger actually runs.
  if (item.status !== "refurbishing") {
    const change = { status: item.status };
    if (item.status === "sold") {
      change.sale_price_cents = item.sale ?? item.list ?? null;
      // coalesce() in the trigger keeps a sold_at we supply; without one it
      // would stamp today and every days-to-sale figure would be wrong.
      if (item.soldAt) change.sold_at = item.soldAt;
    }
    const { error } = await admin.from("items").update(change).eq("id", item.id);
    if (error) warn(`${item.title}: moving to ${item.status} — ${error.message}`);
  }

  // ── The website ────────────────────────────────────────────────────────
  // Last, and its own write, for the reason setStage() gives: the publish gate
  // fires before the status trigger, so a published_at set alongside a status
  // change would slip past the check meant to validate it.
  if (item.published) {
    const publishedAt = `${item.arrived}T16:30:00+02:00`;
    const { error } = await admin
      .from("items")
      .update({ published_at: publishedAt })
      .eq("id", item.id);
    if (error) warn(`${item.title}: publishing — ${error.message}`);
  }

  seeded.push(item);
  const stage = item.published ? green("live") : dim("off-site");
  console.log(
    `  ${green("+")}  ${item.title.padEnd(42)} ${dim(item.status.padEnd(14))} ${stage} ` +
      dim(`${media.filter((m) => m.kind === "photo").length}p ${media.filter((m) => m.kind === "video").length}v`)
  );
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

console.log("\n  People\n");

const itemIdByIndex = new Map(ITEMS.map((item, index) => [index + 1, item.id]));

for (const person of LEADS) {
  const { error: insertError } = await admin.from("leads").insert({
    id: person.id,
    full_name: person.full_name ?? null,
    business_name: person.business_name ?? null,
    email: person.email ?? null,
    phone: person.phone ?? null,
    birthday: person.birthday ?? null,
    source: person.source,
    status: person.status,
    notes: person.notes ?? null,
    email_consent_at: person.emailConsent ?? null,
    whatsapp_consent_at: person.whatsappConsent ?? null,
    consent_source: person.consentSource ?? null,
    extra: { [DEMO_MARKER]: DEMO_STAMP },
    created_at: person.createdAt,
  });
  if (insertError) {
    warn(`${person.full_name ?? person.phone}: ${insertError.message}`);
    continue;
  }

  // ── What they want ─────────────────────────────────────────────────────
  if (person.interests?.length) {
    const { error } = await admin.from("lead_interests").insert(
      person.interests.map((want) => ({
        lead_id: person.id,
        category_id: id(categories, want.category, "category"),
        subcategory_id: id(subcategories, want.subcategory, "subcategory"),
        item_id: want.item ? itemIdByIndex.get(want.item) : null,
        budget_max_cents: want.budget ?? null,
        min_grade: want.minGrade ?? null,
        description: want.description ?? "",
        active: want.active ?? true,
        created_at: person.createdAt,
      }))
    );
    if (error) warn(`${person.full_name ?? person.phone}: interests — ${error.message}`);
  }

  // ── The timeline ───────────────────────────────────────────────────────
  // Inserted in order so lead_events_touch_contacted lands on the latest one.
  if (person.events?.length) {
    const { error } = await admin.from("lead_events").insert(
      person.events.map((event) => ({
        lead_id: person.id,
        kind: event.kind,
        body: event.body ?? null,
        item_id: event.item ? itemIdByIndex.get(event.item) : null,
        created_at: event.at,
      }))
    );
    if (error) warn(`${person.full_name ?? person.phone}: timeline — ${error.message}`);
  }

  // ── Opting out ─────────────────────────────────────────────────────────
  // Done as an update rather than set at insert, so leads_log_consent_change
  // writes the audit row a regulator would ask for. Inserting it directly would
  // produce an unsubscribed lead with no evidence of unsubscribing.
  if (person.unsubscribedAt) {
    const { error } = await admin
      .from("leads")
      .update({ unsubscribed_at: person.unsubscribedAt })
      .eq("id", person.id);
    if (error) warn(`${person.full_name}: opt-out — ${error.message}`);
  }

  // Only where the timeline does not already imply it — the trigger derives
  // last_contacted_at from events, and this is for the ones with none.
  if (person.lastContacted) {
    await admin
      .from("leads")
      .update({ last_contacted_at: person.lastContacted })
      .eq("id", person.id);
  }

  const reach = [person.email && "email", person.phone && "phone"].filter(Boolean).join(" + ");
  console.log(
    `  ${green("+")}  ${(person.full_name ?? "(no name)").padEnd(24)} ` +
      `${dim((person.business_name ?? "—").slice(0, 30).padEnd(31))} ` +
      `${dim(person.status.padEnd(9))} ${dim(reach)}` +
      (person.unsubscribedAt ? ` ${red("unsubscribed")}` : "")
  );
}

// ---------------------------------------------------------------------------
// Match stock to people
// ---------------------------------------------------------------------------
// The real nightly sweep, run once by hand. It only considers `listed` stock,
// honours consent and the seven-day cap, and queues at most one suggestion per
// person — so the number below is a genuine result, not fifteen rows forced in.

const { data: matched, error: matchError } = await admin.rpc("run_stock_match");
if (matchError) warn(`stock matching: ${matchError.message}`);
else console.log(`\n  ${green("→")}  ${matched} outreach suggestion(s) queued for staff to approve.`);

// ---------------------------------------------------------------------------
// Tell the storefront
// ---------------------------------------------------------------------------

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
      ? `  ${green("→")}  Storefront cache dropped.`
      : `  ${red("!")}  Storefront cache NOT dropped (${res.status}).`
  );
} else {
  console.log(dim("  STOREFRONT_URL / REVALIDATE_SECRET not set — the site will catch up within five minutes."));
}

// ---------------------------------------------------------------------------

const live = seeded.filter((i) => i.published).length;
console.log(
  `\n  ${seeded.length} machines seeded, ${live} of them on the website. ` +
    `${LEADS.length} people in the CRM.`
);
console.log(dim("  Remove all of it with: npm run demo:clear\n"));

if (warnings.length) {
  console.log(red(`  ${warnings.length} warning(s) above — the seed is incomplete.\n`));
  process.exit(1);
}
