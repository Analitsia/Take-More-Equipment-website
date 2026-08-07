/**
 * RLS verification.
 *
 * Run against a real project, through the client SDK, with real JWTs:
 *
 *   npm run test:rls
 *
 * Through the SDK and not the SQL editor, because the editor connects as
 * `postgres` and bypasses RLS entirely — it will confirm every policy you have,
 * including the broken ones.
 *
 * The assertion style matters. RLS denies by returning ZERO ROWS, not an error,
 * so `expect(error).not.toBeNull()` passes when the policy works, when the table
 * does not exist, and when the client silently failed to authenticate. Every
 * denial below asserts `rows.length === 0 && error === null`, and every one is
 * paired with a positive control proving the same query DOES return rows for
 * somebody — otherwise the suite would pass against an empty database.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishable || !secret) {
  console.error("Missing env. Run with: node --env-file=.env.local packages/db/tests/rls.test.mjs");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
const anon = createClient(url, publishable, { auth: { persistSession: false } });

let passed = 0;
const failures = [];

const ok = (name) => {
  passed++;
  console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
};
const fail = (name, detail) => {
  failures.push({ name, detail });
  console.log(`  \x1b[31mFAIL\x1b[0m  ${name}\n        ${detail}`);
};

/** RLS-style denial: no rows, and crucially no error either. */
const denied = async (name, query) => {
  const { data, error } = await query;
  if (error) return fail(name, `expected a clean empty result, got error: ${error.message}`);
  if ((data ?? []).length !== 0) return fail(name, `expected 0 rows, got ${data.length}`);
  ok(name);
};

/** Grant-style denial: the request is refused outright. */
const refused = async (name, query) => {
  const { error } = await query;
  if (!error) return fail(name, "expected the request to be refused, it succeeded");
  ok(`${name}  (${error.code || "error"})`);
};

const visible = async (name, query, expected) => {
  const { data, error } = await query;
  if (error) return fail(name, `unexpected error: ${error.message}`);
  const n = (data ?? []).length;
  if (expected !== undefined && n !== expected) {
    return fail(name, `expected ${expected} row(s), got ${n}`);
  }
  if (expected === undefined && n === 0) return fail(name, "expected rows, got none");
  ok(name);
};

const stamp = Date.now();
const users = {
  staff: { email: `rls-staff-${stamp}@takemore.test`, password: "test-password-1234", role: "staff" },
  manager: { email: `rls-manager-${stamp}@takemore.test`, password: "test-password-1234", role: "manager" },
  owner: { email: `rls-owner-${stamp}@takemore.test`, password: "test-password-1234", role: "owner" },
};

const created = [];
let publishedId, draftId;

async function setup() {
  for (const key of Object.keys(users)) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser ${key}: ${error.message}`);
    u.id = data.user.id;
    created.push(data.user.id);

    const { error: profileError } = await admin
      .from("staff_profiles")
      .insert({ user_id: u.id, full_name: `RLS ${key}`, role: u.role });
    if (profileError) throw new Error(`staff_profiles ${key}: ${profileError.message}`);

    u.client = createClient(url, publishable, { auth: { persistSession: false } });
    const { error: signInError } = await u.client.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });
    if (signInError) throw new Error(`signIn ${key}: ${signInError.message}`);
  }

  const { data: category } = await admin.from("categories").select("id").eq("slug", "cooking").single();

  // A published item, built the only way the schema allows: draft → media → publish.
  const { data: pub, error: pubError } = await admin
    .from("items")
    .insert({
      title: "RLS Test Combi Oven",
      category_id: category.id,
      condition_grade: "A",
      description: "A test unit created by the RLS suite. Long enough to clear the publish gate's forty-character floor.",
      list_price_cents: 5_000_000,
      location_code: "RLS-BIN-1",
    })
    .select("id")
    .single();
  if (pubError) throw new Error(`create item: ${pubError.message}`);
  publishedId = pub.id;

  await admin.from("item_media").insert({
    item_id: publishedId,
    kind: "photo",
    external_url: "https://example.test/rls.jpg",
    is_placeholder: true,
    position: 0,
  });
  // One hop at a time: the trigger enforces intake → ready → listed, and there
  // is deliberately no shortcut. Doing this the long way here is also a live
  // check that the legal path works, not just that the illegal one is blocked.
  for (const status of ["ready", "listed"]) {
    const { error } = await admin.from("items").update({ status }).eq("id", publishedId);
    if (error) throw new Error(`transition to ${status}: ${error.message}`);
  }

  const { error: publishError } = await admin
    .from("items")
    .update({ published_at: new Date().toISOString() })
    .eq("id", publishedId);
  if (publishError) throw new Error(`publish: ${publishError.message}`);

  const { data: draft } = await admin
    .from("items")
    .insert({ title: "RLS Draft Fryer", category_id: category.id })
    .select("id")
    .single();
  draftId = draft.id;

  await admin.from("item_costs").insert({
    item_id: publishedId,
    kind: "auction",
    amount_cents: 2_000_000,
  });
}

async function run() {
  console.log("\nANONYMOUS (the public storefront)");
  await visible("anon reads published items", anon.from("public_items").select("id").eq("id", publishedId), 1);
  await denied("anon cannot see unpublished drafts", anon.from("public_items").select("id").eq("id", draftId));
  await denied("anon cannot see a draft through the base table", anon.from("items").select("id").eq("id", draftId));
  // Refused, not merely filtered. These three carry no anon grant at all, so
  // the request dies at the privilege check before RLS is ever consulted —
  // a strictly stronger guarantee than an empty result set, and the reason
  // cost data is unreachable from the public app by construction.
  await refused("anon cannot read item_costs", anon.from("item_costs").select("amount_cents"));
  await refused("anon cannot read staff_profiles", anon.from("staff_profiles").select("user_id"));
  await refused("anon cannot read activity_log", anon.from("activity_log").select("id"));
  await refused("anon cannot read item_economics", anon.from("item_economics").select("margin_cents"));
  await refused("anon cannot select the location_code column", anon.from("items").select("location_code"));
  await refused("anon cannot insert an item", anon.from("items").insert({ title: "hacked" }));

  console.log("\nSTAFF (types the cost in, must never read it back)");
  const staff = users.staff.client;
  await visible("staff reads every item, drafts included", staff.from("items").select("id").eq("id", draftId), 1);
  await denied("staff cannot read item_costs", staff.from("item_costs").select("amount_cents"));
  await denied("staff cannot read item_economics", staff.from("item_economics").select("margin_cents"));
  await visible(
    "staff records a cost through the RPC",
    staff.rpc("record_item_cost", { p_item_id: publishedId, p_kind: "parts", p_amount_cents: 150_000 }).then((r) => ({ data: [r.error ?? "ok"], error: r.error })),
    1
  );
  await denied("staff still cannot read the cost they just wrote", staff.from("item_costs").select("amount_cents"));
  await visible("staff creates an item", staff.from("items").insert({ title: "Staff Test Item" }).select("id"), 1);

  console.log("\nSTAFF privilege escalation");
  const { error: escalate } = await staff
    .from("staff_profiles")
    .update({ role: "owner" })
    .eq("user_id", users.staff.id);
  if (escalate) ok(`staff cannot promote itself to owner  (${escalate.code || "error"})`);
  else {
    const { data: check } = await admin
      .from("staff_profiles")
      .select("role")
      .eq("user_id", users.staff.id)
      .single();
    check.role === "staff"
      ? ok("staff cannot promote itself to owner  (no rows matched)")
      : fail("staff cannot promote itself to owner", `role is now ${check.role}`);
  }

  console.log("\nMANAGER");
  const manager = users.manager.client;
  await visible("manager reads item_costs", manager.from("item_costs").select("amount_cents").eq("item_id", publishedId));
  await visible("manager reads margin", manager.from("item_economics").select("margin_cents").eq("item_id", publishedId), 1);

  const { data: econ } = await manager
    .from("item_economics")
    .select("total_cost_cents, margin_cents, margin_percent")
    .eq("item_id", publishedId)
    .single();
  // R50 000 asking, R20 000 auction + R1 500 parts = R21 500 cost → R28 500 margin.
  if (econ && Number(econ.total_cost_cents) === 2_150_000 && Number(econ.margin_cents) === 2_850_000) {
    ok(`margin arithmetic is right  (cost ${econ.total_cost_cents}, margin ${econ.margin_cents}, ${econ.margin_percent}%)`);
  } else {
    fail("margin arithmetic is right", `got ${JSON.stringify(econ)}`);
  }

  console.log("\nOWNER");
  const owner = users.owner.client;
  await visible("owner reads costs", owner.from("item_costs").select("amount_cents").eq("item_id", publishedId));
  const { error: roleChange } = await owner
    .from("staff_profiles")
    .update({ role: "manager" })
    .eq("user_id", users.staff.id);
  roleChange
    ? fail("owner can change a role", roleChange.message)
    : ok("owner can change a role");

  console.log("\nDOMAIN RULES");
  const { error: illegal } = await admin
    .from("items")
    .update({ status: "sold" })
    .eq("id", draftId); // draft is at 'intake'
  illegal
    ? ok(`illegal status transition intake → sold is refused  (${illegal.code || "error"})`)
    : fail("illegal status transition intake → sold is refused", "the update succeeded");

  const { data: cat2 } = await admin.from("categories").select("id").eq("slug", "bakery").single();
  const { data: noPhoto } = await admin
    .from("items")
    .insert({
      title: "No Photo Oven",
      category_id: cat2.id,
      condition_grade: "B",
      description: "This description is comfortably longer than the forty character floor the gate enforces.",
      list_price_cents: 100_000,
    })
    .select("id")
    .single();
  const { error: gateError } = await admin
    .from("items")
    .update({ published_at: new Date().toISOString() })
    .eq("id", noPhoto.id);
  gateError
    ? ok("publishing without a photo is refused")
    : fail("publishing without a photo is refused", "the publish succeeded");

  const { data: skuRow } = await admin.from("items").select("sku, slug").eq("id", publishedId).single();
  /^TME-\d{4}-\d{4,}$/.test(skuRow.sku)
    ? ok(`SKU generated in the documented format  (${skuRow.sku})`)
    : fail("SKU format", skuRow.sku);
  skuRow.slug === "rls-test-combi-oven"
    ? ok(`slug generated from the title  (${skuRow.slug})`)
    : fail("slug generation", skuRow.slug);

  // Renaming a published item must not move its URL.
  await admin.from("items").update({ title: "Renamed After Publishing" }).eq("id", publishedId);
  const { data: after } = await admin.from("items").select("slug").eq("id", publishedId).single();
  after.slug === "rls-test-combi-oven"
    ? ok("a published slug is frozen against renames")
    : fail("a published slug is frozen against renames", `slug moved to ${after.slug}`);

  const { data: log } = await admin
    .from("activity_log")
    .select("action")
    .eq("entity_id", publishedId);
  const actions = new Set((log ?? []).map((r) => r.action));
  actions.has("created") && actions.has("published")
    ? ok(`activity logged by trigger  (${[...actions].join(", ")})`)
    : fail("activity logged by trigger", [...actions].join(", ") || "nothing logged");
}

async function cleanup() {
  await admin.from("items").delete().ilike("title", "%RLS%");
  await admin.from("items").delete().in("title", ["Staff Test Item", "No Photo Oven", "Renamed After Publishing"]);
  for (const id of created) await admin.auth.admin.deleteUser(id);
}

try {
  await setup();
  await run();
} catch (error) {
  fail("suite", error.message);
} finally {
  await cleanup();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  process.exit(1);
}
