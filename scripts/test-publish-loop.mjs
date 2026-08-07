/**
 * The publish loop, end to end, against the live deployments.
 *
 *   node --env-file=.env.local scripts/test-publish-loop.mjs
 *
 * This is the one test that exercises the whole claim the architecture rests
 * on: an item created by staff reaches the public site, keeps its page when it
 * sells, and disappears only when a human takes it down.
 *
 * It writes to the production database and cleans up after itself. Everything
 * it creates is prefixed so a failed run leaves an obvious trail.
 */

import { createClient } from "@supabase/supabase-js";

const STOREFRONT = process.env.STOREFRONT_URL ?? "https://take-more-equipment-website.vercel.app";
const secret = process.env.REVALIDATE_SECRET;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } }
);

let passed = 0;
const failures = [];
const ok = (n) => { passed++; console.log(`  \x1b[32mPASS\x1b[0m  ${n}`); };
const fail = (n, d) => { failures.push(n); console.log(`  \x1b[31mFAIL\x1b[0m  ${n}\n        ${d}`); };

/** Drop the storefront's cache, the same way the ops app does after a write. */
async function revalidate() {
  if (!secret) throw new Error("REVALIDATE_SECRET missing — cannot test the loop");
  const res = await fetch(`${STOREFRONT}/api/revalidate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-revalidate-secret": secret },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`revalidate returned ${res.status}`);
  // The tag is dropped synchronously, but the CDN needs a beat to stop serving
  // the previous render.
  await new Promise((r) => setTimeout(r, 2500));
}

const catalogue = async () => {
  const res = await fetch(`${STOREFRONT}/api/catalogue`, { cache: "no-store" });
  return res.json();
};

const TITLE = "Loop Test Combi Steamer";
let itemId, slug;

try {
  // ---------------------------------------------------------------- setup --
  const { data: category } = await admin
    .from("categories").select("id").eq("slug", "cooking").single();

  const { data: item, error: createError } = await admin
    .from("items")
    .insert({
      title: TITLE,
      brand: "LoopTest",
      category_id: category.id,
      condition_grade: "A",
      description:
        "Created by the publish-loop test to prove an item entered in ops reaches the public site. Deleted automatically.",
      capacity: "6 × GN 1/1",
      power: "10.2 kW",
      list_price_cents: 4_250_000,
      retail_price_cents: 9_800_000,
      width_mm: 935, depth_mm: 780, height_mm: 1010, weight_kg: 118,
    })
    .select("id, slug")
    .single();
  if (createError) throw new Error(`create: ${createError.message}`);
  itemId = item.id;
  slug = item.slug;
  ok(`item created as a draft  (${slug})`);

  // A real object in Storage, so the public URL and the image transformer are
  // exercised rather than assumed.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const path = `items/${itemId}/loop-test.png`;
  const { error: uploadError } = await admin.storage
    .from("item-media").upload(path, png, { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error(`upload: ${uploadError.message}`);

  await admin.from("item_media").insert({
    item_id: itemId, kind: "photo", storage_path: path, position: 0,
  });
  ok("photo uploaded to Storage and recorded");

  // -------------------------------------------------- not visible as draft --
  await revalidate();
  let index = await catalogue();
  (index.items ?? []).some((i) => i.slug === slug)
    ? fail("a draft is NOT on the public site", "it is visible")
    : ok("a draft is not on the public site");

  // ------------------------------------------------------------- publish ---
  for (const status of ["ready", "listed"]) {
    const { error } = await admin.from("items").update({ status }).eq("id", itemId);
    if (error) throw new Error(`transition ${status}: ${error.message}`);
  }
  const { error: publishError } = await admin
    .from("items").update({ published_at: new Date().toISOString() }).eq("id", itemId);
  if (publishError) throw new Error(`publish: ${publishError.message}`);
  ok("published through the legal status path");

  await revalidate();
  index = await catalogue();
  const live = (index.items ?? []).find((i) => i.slug === slug);
  live
    ? ok(`it appears on the public site  (${live.title}, R${live.price.toLocaleString("en-ZA")})`)
    : fail("it appears on the public site", "not found in the catalogue index");

  if (live?.image) {
    const res = await fetch(live.image);
    res.ok
      ? ok(`its photo loads from Storage  (${res.status}, ${res.headers.get("content-type")})`)
      : fail("its photo loads from Storage", `got ${res.status}`);
  } else {
    fail("its photo loads from Storage", "no image URL on the card");
  }

  const detail = await fetch(`${STOREFRONT}/stock/${slug}`);
  detail.ok
    ? ok(`its detail page renders  (/stock/${slug} → ${detail.status})`)
    : fail("its detail page renders", `got ${detail.status}`);

  // The homepage is statically rendered, so this is the check that the tag
  // actually regenerates a page rather than only a data cache.
  const home = await fetch(`${STOREFRONT}/`, { cache: "no-store" }).then((r) => r.text());
  home.includes(TITLE)
    ? ok("the homepage catalogue regenerated and shows it")
    : fail("the homepage catalogue regenerated", "the title is not in the rendered HTML");

  // ------------------------------------------- sold, but STILL on the site --
  const { error: soldError } = await admin
    .from("items").update({ status: "sold", sale_price_cents: 4_100_000 }).eq("id", itemId);
  if (soldError) throw new Error(`sold: ${soldError.message}`);

  await revalidate();
  index = await catalogue();
  const stillThere = (index.items ?? []).find((i) => i.slug === slug);
  if (stillThere && stillThere.sold) {
    ok(`sold — and it STAYS on the site with a sold badge  (R${stillThere.price.toLocaleString("en-ZA")})`);
  } else if (stillThere) {
    fail("sold items stay visible and are badged", "it is visible but not flagged sold");
  } else {
    fail("sold items stay visible", "it vanished — status and published_at are not independent");
  }

  // ------------------------------------------------------------ unpublish --
  await admin.from("items").update({ published_at: null }).eq("id", itemId);
  await revalidate();
  index = await catalogue();
  (index.items ?? []).some((i) => i.slug === slug)
    ? fail("unpublishing removes it", "still visible")
    : ok("unpublishing removes it from the site");
} catch (error) {
  fail("loop", error.message);
} finally {
  if (itemId) {
    await admin.storage.from("item-media").remove([`items/${itemId}/loop-test.png`]);
    await admin.from("items").delete().eq("id", itemId);
    await revalidate().catch(() => {});
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
