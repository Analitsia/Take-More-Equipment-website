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
let publishedId, draftId, publishedPhotoPath;

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

    const { error: profileError } = await admin.from("staff_profiles").insert({
      user_id: u.id,
      full_name: `RLS ${key}`,
      role: u.role,
      // Approved, because these fixtures stand for people already on the team.
      // Without it app.staff_role() returns null for every one of them and the
      // whole suite fails as "not staff" — which is the correct behaviour for
      // an unactioned request, and is asserted separately below.
      approved_at: new Date().toISOString(),
    });
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

  /**
   * A REAL photograph, uploaded to Storage.
   *
   * This fixture used to attach a placeholder row and publish on it. The schema
   * allowed that because the publish gate counted any photo at all; it no
   * longer does (20260809090000_no_placeholders_on_published.sql), so an item
   * cannot go live on a stock image.
   *
   * Actually putting bytes in the bucket rather than only writing the row is
   * what lets the STORAGE section below assert the thing that matters: that the
   * public CDN URL still returns 200 after anon lost its read policy. Without a
   * real object that assertion would be untestable, and it is the assertion the
   * whole storage migration rests on.
   *
   * The smallest valid PNG there is — 1×1, transparent, 67 bytes.
   */
  publishedPhotoPath = `items/${publishedId}/${crypto.randomUUID()}.png`;
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  const { error: uploadError } = await admin.storage
    .from("item-media")
    .upload(publishedPhotoPath, onePixelPng, { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error(`upload fixture photo: ${uploadError.message}`);

  await admin.from("item_media").insert({
    item_id: publishedId,
    kind: "photo",
    storage_path: publishedPhotoPath,
    is_placeholder: false,
    position: 0,
  });
  // A draft starts at 'refurbishing' and any stage is one hop from any other, so
  // this is a single move — and a live check that the legal path works, not only
  // that the illegal one below is blocked.
  {
    const { error } = await admin.from("items").update({ status: "listed" }).eq("id", publishedId);
    if (error) throw new Error(`transition to listed: ${error.message}`);
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
  // The Dashboard's two views. item_analytics carries the whole cost ledger
  // split by kind, which makes it the widest cost surface in the schema — it
  // gets the same no-grant treatment as item_economics, checked here so a
  // future `create or replace` that drops the revoke fails a test.
  await refused("anon cannot read item_analytics", anon.from("item_analytics").select("cost_cents"));
  await refused("anon cannot read lead_demand", anon.from("lead_demand").select("lead_id"));
  await refused("anon cannot select the location_code column", anon.from("items").select("location_code"));
  await refused("anon cannot insert an item", anon.from("items").insert({ title: "hacked" }));

  console.log("\nSTAFF (types the cost in, must never read it back)");
  const staff = users.staff.client;
  await visible("staff reads every item, drafts included", staff.from("items").select("id").eq("id", draftId), 1);
  await denied("staff cannot read item_costs", staff.from("item_costs").select("amount_cents"));
  await denied("staff cannot read item_economics", staff.from("item_economics").select("margin_cents"));
  // Empty, not partial. If the can_see_costs() guard were ever dropped from
  // item_analytics, a staff account would read every machine with a cost of
  // zero and therefore a margin equal to the whole asking price — and the
  // Dashboard would render that as fact. This assertion is what stands between
  // that and a deploy.
  await denied("staff cannot read item_analytics", staff.from("item_analytics").select("cost_cents"));
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

  // -------------------------------------------------------------------------
  // A request that nobody has approved yet
  // -------------------------------------------------------------------------
  // The whole request-access flow rests on one claim: an account can exist, be
  // confirmed, hold a valid session, and still be able to do NOTHING until an
  // owner sets approved_at. That is enforced in a single place — the
  // `approved_at is not null` clause in app.staff_role() — and everything else
  // in the schema inherits it, which is exactly the kind of load-bearing
  // one-liner that deserves its own test rather than trust.
  //
  // The positive control is the block above: the same queries against the same
  // rows return data for an approved staff account.
  console.log("\nPENDING (requested access, not yet approved)");
  const pendingEmail = `rls-pending-${stamp}@takemore.test`;
  const { data: pendingUser, error: pendingCreateError } = await admin.auth.admin.createUser({
    email: pendingEmail,
    password: "test-password-1234",
    email_confirm: true,
  });
  if (pendingCreateError) throw new Error(`createUser pending: ${pendingCreateError.message}`);
  created.push(pendingUser.user.id);

  // Exactly what requestAccess() writes: a real profile, no approval.
  await admin.from("staff_profiles").insert({
    user_id: pendingUser.user.id,
    full_name: "RLS pending",
    role: "staff",
    active: true,
  });

  const pending = createClient(url, publishable, { auth: { persistSession: false } });
  const { error: pendingSignIn } = await pending.auth.signInWithPassword({
    email: pendingEmail,
    password: "test-password-1234",
  });
  pendingSignIn
    ? fail("a pending account can still sign in", pendingSignIn.message)
    : ok("a pending account can still sign in");

  await denied("pending cannot read items", pending.from("items").select("id").eq("id", draftId));
  await refused(
    "pending cannot create an item",
    pending.from("items").insert({ title: "Pending Test Item" }).select("id")
  );
  await denied("pending cannot read item_costs", pending.from("item_costs").select("amount_cents"));

  // Sees its own row and no one else's — which is what the waiting screen
  // reads, and the reason that policy exists at all.
  await visible(
    "pending reads its own profile",
    pending.from("staff_profiles").select("user_id").eq("user_id", pendingUser.user.id),
    1
  );
  await visible(
    "pending sees only itself, not the team",
    pending.from("staff_profiles").select("user_id"),
    1
  );

  // The escalation that would make the whole gate decorative.
  const { error: selfApprove } = await pending
    .from("staff_profiles")
    .update({ approved_at: new Date().toISOString(), role: "owner" })
    .eq("user_id", pendingUser.user.id);
  if (selfApprove) ok(`pending cannot approve itself  (${selfApprove.code || "error"})`);
  else {
    const { data: check } = await admin
      .from("staff_profiles")
      .select("approved_at")
      .eq("user_id", pendingUser.user.id)
      .single();
    check?.approved_at
      ? fail("pending cannot approve itself", "it set its own approved_at")
      : ok("pending cannot approve itself  (no rows matched)");
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

  // The Dashboard reads item_analytics, not item_economics, so the split has to
  // be checked on its own terms: the same R21 500 has to land in the right two
  // buckets, and an unsold machine's margin has to sit in unrealised_ rather
  // than in margin_ where it would be counted as money earned.
  await visible(
    "manager reads item_analytics",
    manager.from("item_analytics").select("cost_cents").eq("item_id", publishedId),
    1
  );
  const { data: split } = await manager
    .from("item_analytics")
    .select("cost_cents, cost_auction_cents, cost_parts_cents, margin_cents, unrealised_margin_cents, tied_up_cents")
    .eq("item_id", publishedId)
    .single();
  const expected = {
    cost_cents: 2_150_000,
    cost_auction_cents: 2_000_000,
    cost_parts_cents: 150_000,
    // Not sold, so nothing is realised and the whole R28 500 is a hope.
    margin_cents: 0,
    unrealised_margin_cents: 2_850_000,
    tied_up_cents: 2_150_000,
  };
  const wrong = Object.entries(expected).filter(
    ([key, value]) => Number(split?.[key]) !== value
  );
  wrong.length === 0
    ? ok("the cost ledger splits by kind, and an unsold margin stays unrealised")
    : fail(
        "the cost ledger splits by kind, and an unsold margin stays unrealised",
        `${wrong.map(([k, v]) => `${k}: expected ${v}, got ${split?.[k]}`).join("; ")}`
      );


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
  // The four live stages all reach each other, so the illegal move to prove is
  // one into a RETIRED status. `intake` is still in the Postgres enum — a value
  // cannot be dropped without rebuilding the type — and the only thing keeping
  // it unreachable is its absence from item_status_transitions. This asserts
  // that absence is actually load-bearing.
  const { error: illegal } = await admin
    .from("items")
    .update({ status: "intake" })
    .eq("id", draftId); // draft is at 'refurbishing'
  illegal
    ? ok(`retired status is unreachable: refurbishing → intake refused  (${illegal.code || "error"})`)
    : fail("retired status is unreachable: refurbishing → intake refused", "the update succeeded");

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

  await leads();
}

/**
 * The lead tables.
 *
 * The whole point of the capture design is that `anon` has NO policy and NO
 * grant on any of these — the storefront reaches them only through
 * public.capture_lead(), which is SECURITY DEFINER and returns void. That claim
 * is only worth making if something checks it, so this section is mostly
 * refusals, each paired with a positive control proving the same query works for
 * somebody.
 */
async function leads() {
  console.log("\nLEADS — the public may not touch the tables");
  const staff = users.staff.client;
  const manager = users.manager.client;

  // The OWNER section above promotes this fixture to manager to prove an owner
  // can change a role, and app.staff_role() reads the table on every call — so
  // without this the "staff cannot create a campaign" assertion below is made by
  // a manager and passes for the wrong reason. Put back where it started.
  await admin.from("staff_profiles").update({ role: "staff" }).eq("user_id", users.staff.id);

  // Anon has no SELECT grant at all, so these are refusals rather than empty
  // results — a grant gap and a policy gap look different, and both are wanted.
  await refused("anon cannot read leads", anon.from("leads").select("id").limit(1));
  await refused("anon cannot read interests", anon.from("lead_interests").select("id").limit(1));
  await refused("anon cannot read the timeline", anon.from("lead_events").select("id").limit(1));
  await refused("anon cannot read the outreach queue", anon.from("outreach_messages").select("id").limit(1));
  await refused("anon cannot read campaigns", anon.from("outreach_campaigns").select("id").limit(1));
  await refused(
    "anon cannot insert a lead directly",
    anon.from("leads").insert({ email: `direct-${stamp}@rls.test` })
  );

  console.log("\nLEADS — but the capture function is the way in");
  const captureEmail = `capture-${stamp}@rls.test`;
  {
    const { error } = await anon.rpc("capture_lead", {
      p_email: captureEmail,
      p_name: "RLS Capture Person",
      p_phone: "082 000 4321",
      p_message: "wants a combi oven for a small bakery",
      p_from_product: false,
      p_email_consent: true,
    });
    error ? fail("anon may call capture_lead", error.message) : ok("anon may call capture_lead");
  }

  const { data: captured } = await admin
    .from("leads")
    .select("id, phone_e164, email_consent_at, unsubscribe_token, source")
    .eq("email", captureEmail)
    .maybeSingle();

  captured?.phone_e164 === "+27820004321"
    ? ok(`capture normalises the phone number  (${captured.phone_e164})`)
    : fail("capture normalises the phone number", captured?.phone_e164 ?? "no row");

  captured?.source === "website_general"
    ? ok("the source is decided server-side, not by the caller")
    : fail("the source is decided server-side", captured?.source ?? "no row");

  // The same person again, spelled differently, must not become a second row.
  await anon.rpc("capture_lead", {
    p_email: captureEmail.toUpperCase(),
    p_phone: "+27 (0)82 000 4321",
    p_message: "and a proving oven",
  });
  {
    const { data } = await admin.from("leads").select("id").eq("phone_e164", "+27820004321");
    (data ?? []).length === 1
      ? ok("a repeat enquiry enriches the person instead of duplicating them")
      : fail("repeat enquiry deduplicates", `${(data ?? []).length} rows`);
  }

  console.log("\nLEADS — staff may work them, and that is the point");
  await visible("staff read leads", staff.from("leads").select("id").eq("id", captured.id), 1);
  await visible(
    "staff read what somebody wants",
    staff.from("lead_interests").select("id").eq("lead_id", captured.id)
  );
  // The Dashboard's demand chart. Unlike item_analytics this view carries no
  // extra guard, deliberately — every approved staff member may already read
  // every lead two lines above, and there is nothing in here they cannot see on
  // the Clients page. Asserted so "staff cannot read it" is never added by
  // analogy with the cost views, which would silently empty a chart.
  await visible(
    "staff read lead_demand",
    staff.from("lead_demand").select("lead_id, category, is_customer").eq("lead_id", captured.id)
  );
  {
    const { error } = await staff
      .from("leads")
      .update({ notes: "Spoke Tuesday." })
      .eq("id", captured.id);
    error ? fail("staff may edit a lead", error.message) : ok("staff may edit a lead");
  }
  {
    const { error } = await staff
      .from("lead_events")
      .insert({ lead_id: captured.id, kind: "call", body: "Rang about the combi." });
    error ? fail("staff may log a call", error.message) : ok("staff may log a call");
  }
  // The timeline is evidence, so there is no UPDATE policy on it at all.
  {
    const { data: event } = await admin
      .from("lead_events")
      .select("id")
      .eq("lead_id", captured.id)
      .limit(1)
      .single();
    const { error } = await staff
      .from("lead_events")
      .update({ body: "Never happened." })
      .eq("id", event.id);
    error
      ? ok(`the timeline cannot be rewritten  (${error.code || "error"})`)
      : fail("the timeline cannot be rewritten", "the update succeeded");
  }

  console.log("\nLEADS — bulk sending is where the role split lives");
  await refused(
    "staff cannot create a campaign",
    staff.from("outreach_campaigns").insert({ name: "RLS blast", subject: "RLS blast" })
  );
  {
    const { error } = await manager
      .from("outreach_campaigns")
      .insert({ name: `RLS campaign ${stamp}`, subject: "RLS test subject" });
    error ? fail("a manager can create a campaign", error.message) : ok("a manager can create a campaign");
  }

  console.log("\nLEADS — consent and the opt-out");
  {
    const { data: sent } = await anon.rpc("unsubscribe", { p_token: captured.unsubscribe_token });
    sent === true ? ok("anon may unsubscribe with a token") : fail("anon may unsubscribe", String(sent));
  }
  {
    const { data: bogus } = await anon.rpc("unsubscribe", {
      p_token: "00000000-0000-0000-0000-000000000000",
    });
    bogus === false
      ? ok("a bogus unsubscribe token reports failure rather than lying")
      : fail("bogus token reports failure", String(bogus));
  }
  {
    const { data } = await admin
      .from("lead_events")
      .select("kind")
      .eq("lead_id", captured.id)
      .eq("kind", "unsubscribed");
    (data ?? []).length === 1
      ? ok("opting out writes its own audit entry")
      : fail("opt-out is audited", `${(data ?? []).length} entries`);
  }

  console.log("\nLEADS — the embeds the CRM screens depend on");
  // These are the exact select strings from apps/ops/src/lib/leads.ts, and they
  // are here because a broken EMBED is invisible to every other check in this
  // repo: it typechecks, it builds, and it 500s the first time somebody opens
  // the page. PostgREST resolves relationships from foreign keys at runtime, so
  // "does this join exist" is a property of the schema that only a real query
  // can answer.
  //
  // Two ways it broke on the first deploy, both represented below:
  //   - lead_interests points at items TWICE, so an unqualified embed is
  //     ambiguous and the whole query is refused
  //   - lead_events.actor_id pointed at auth.users, which has no route to
  //     staff_profiles
  const INTEREST_SELECT = `
    id, category_id, subcategory_id, item_id, budget_max_cents, min_grade,
    description, active, created_at,
    category:categories(name),
    subcategory:subcategories(name),
    item:items!lead_interests_item_id_fkey(title, slug),
    tags:lead_interest_tags(tag_id)
  `;

  await visible(
    "listLeads(): every interest embed resolves",
    staff
      .from("leads")
      .select(`id, full_name, interests:lead_interests(${INTEREST_SELECT})`)
      .eq("id", captured.id),
    1
  );

  await visible(
    "getLeadEvents(): the actor's name embeds",
    staff
      .from("lead_events")
      .select("id, kind, body, created_at, item:items(title, slug), actor:staff_profiles(full_name)")
      .eq("lead_id", captured.id)
  );

  {
    // An empty queue is a legitimate result, so this asserts only that the
    // query is ACCEPTED — a broken embed comes back as an error, not as zero
    // rows, which is the one case `denied()` would wrongly forgive.
    const { error } = await staff
      .from("outreach_messages")
      .select(
        `id, channel, state, reason, body, match_score, created_at,
         lead:leads(id, full_name, email, phone, phone_e164),
         item:items(id, title, brand, slug, list_price_cents,
                    media:item_media(storage_path, external_url))`
      )
      .limit(1);
    error
      ? fail("getQueuedOutreach(): the queue embeds resolve", error.message)
      : ok("getQueuedOutreach(): the queue embeds resolve");
  }

  {
    const { error } = await manager
      .from("outreach_campaigns")
      .select("id, name, subject, intro, state, item_ids, recipient_count, sent_at, error, created_at")
      .limit(1);
    error
      ? fail("listCampaigns(): selects every column it renders", error.message)
      : ok("listCampaigns(): selects every column it renders");
  }

  {
    const { error } = await staff.rpc("leads_wanting_item", { p_item_id: publishedId });
    error
      ? fail("leads_wanting_item(): callable by staff", error.message)
      : ok("leads_wanting_item(): callable by staff");
  }

  console.log("\nLEADS — the matcher");
  // Unsubscribed, so nothing may be queued for them however good the match is.
  {
    const { data: queued, error } = await admin.rpc("match_item_to_leads", {
      p_item_id: publishedId,
    });
    if (error) fail("the matcher runs", error.message);
    else if (queued === 0) ok("an unsubscribed person is never matched");
    else fail("an unsubscribed person is never matched", `${queued} queued`);
  }
  // Back on, with a want that actually matches the published test oven.
  await admin
    .from("leads")
    .update({ unsubscribed_at: null, email_consent_at: new Date().toISOString() })
    .eq("id", captured.id);
  {
    const { data: category } = await admin.from("categories").select("id").eq("slug", "cooking").single();
    await admin
      .from("lead_interests")
      .update({ category_id: category.id, description: "combi oven, renamed after publishing" })
      .eq("lead_id", captured.id);
  }
  let firstRun = 0;
  {
    const { data: queued, error } = await admin.rpc("match_item_to_leads", { p_item_id: publishedId });
    if (error) fail("the matcher queues a real match", error.message);
    else {
      firstRun = queued;
      queued === 1
        ? ok("a consenting person with a matching want is queued exactly once")
        : fail("matcher queues a real match", `${queued} queued`);
    }
  }
  // The whole reason outreach_once exists.
  {
    const { data: again } = await admin.rpc("match_item_to_leads", { p_item_id: publishedId });
    again === 0
      ? ok("running the matcher again queues nothing (outreach_once)")
      : fail("the matcher is idempotent", `${again} queued on the second run`);
  }
  if (firstRun === 1) {
    // A skipped suggestion must stay skipped, or tonight's sweep re-offers
    // exactly what a human just rejected.
    await admin
      .from("outreach_messages")
      .update({ state: "skipped" })
      .eq("lead_id", captured.id);
    const { data: after } = await admin.rpc("match_item_to_leads", { p_item_id: publishedId });
    after === 0
      ? ok("a skipped suggestion is not re-queued")
      : fail("skipped stays skipped", `${after} queued`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nSTORAGE — drafts cannot be enumerated, published photos still serve");
  // ─────────────────────────────────────────────────────────────────────────
  //
  // THIS IS THE SECTION THAT MATTERS MOST IN THIS FILE, because the migration
  // it guards (20260809090300_media_path_hygiene.sql) is one where the obvious
  // implementation changes nothing at all.
  //
  // A Supabase PUBLIC bucket serves from /storage/v1/object/public/… and that
  // endpoint does not evaluate storage.objects SELECT policies. So a policy
  // rewritten to require `published_at is not null` would look like a fix, pass
  // review, and protect nothing. What the policy DOES govern is `list`, and
  // list was the real hole: anon could enumerate every draft photo in the
  // bucket with the publishable key that ships in every visitor's browser.
  //
  // Both halves are asserted here because reasoning about which endpoint
  // consults RLS is exactly how the wrong fix gets shipped.

  {
    const { data: listed, error } = await anon.storage.from("item-media").list("items");
    // A denial here is EITHER an error or an empty array depending on how
    // storage reports it — unlike a table read, where the distinction is
    // load-bearing. Both mean "you cannot see what is in this bucket".
    if (error) {
      ok(`anon cannot list the media bucket  (${error.message})`);
    } else if ((listed ?? []).length === 0) {
      ok("anon cannot list the media bucket  (0 objects)");
    } else {
      fail(
        "anon cannot list the media bucket",
        `enumerated ${listed.length} objects — draft photography is discoverable`
      );
    }
  }

  {
    // The positive control, and the whole reason the bucket is still public.
    // If this fails, every product photograph on the storefront is broken —
    // which is precisely the outcome the "obvious" version of this migration
    // (making the bucket private) would have produced.
    const href = `${url}/storage/v1/object/public/item-media/${publishedPhotoPath}`;
    const response = await fetch(href, { method: "HEAD" });
    response.ok
      ? ok("a published photo is still publicly readable over the CDN path", `${response.status}`)
      : fail("a published photo is still publicly readable", `got ${response.status}`);
  }

  {
    // Staff keep full access — the ops app lists the bucket when managing media.
    const { error } = await staff.storage.from("item-media").list("items");
    error
      ? fail("staff can still list the media bucket", error.message)
      : ok("staff can still list the media bucket");
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nSCHEMA — the functions PostgREST resolves are unambiguous");
  // ─────────────────────────────────────────────────────────────────────────
  //
  // capture_lead() was replaced wholesale by
  // 20260809090100_lead_capture_ceilings.sql. `create or replace` only replaces
  // when the SIGNATURE matches exactly — a changed default, type or parameter
  // order silently creates an OVERLOAD instead, at which point PostgREST picks
  // between two functions unpredictably and half the enquiries hit the old
  // ceilings. Nothing else in the system would notice.
  {
    // Through the STAFF client, not admin. search_everything is SECURITY
    // INVOKER and gates on app.is_staff(), which reads auth.uid() — and the
    // service role has no uid, so admin is refused here exactly as an anonymous
    // caller is. That is the design working, and it is why this suite insists
    // on driving everything through real sessions.
    const { data, error } = await staff.rpc("search_everything", {
      p_query: "RLS",
      p_limit: 5,
    });
    error
      ? fail("search_everything is callable by staff", error.message)
      : ok("search_everything is callable by staff", `${(data ?? []).length} rows`);
  }

  {
    // The service role is deliberately NOT a staff member. Worth pinning: a
    // future refactor that "fixes" this by loosening the guard would open the
    // function to anything holding the secret key with no session at all.
    await refused(
      "the service role alone cannot call search_everything",
      admin.rpc("search_everything", { p_query: "RLS", p_limit: 1 })
    );
  }

  {
    // Anon must not reach the search at all — it reads leads.
    await refused(
      "anon cannot call search_everything",
      anon.rpc("search_everything", { p_query: "fryer", p_limit: 1 })
    );
  }

  {
    // The access-request ledger is service-role only. This is the tightening
    // that distinguishes it from capture_lead, so it is worth asserting.
    await refused(
      "anon cannot call claim_access_request",
      anon.rpc("claim_access_request", { p_email: "nobody@rls.test" })
    );
  }

  {
    await refused(
      "anon cannot read cron_runs",
      anon.from("cron_runs").select("job").limit(1)
    );
  }
}

async function cleanup() {
  // The object first: deleting the item cascades the item_media ROW, which
  // would otherwise leave the bytes in the bucket with nothing pointing at
  // them — invisible, and exactly the orphan check:launch:db looks for.
  if (publishedPhotoPath) {
    await admin.storage.from("item-media").remove([publishedPhotoPath]);
  }
  await admin.from("items").delete().ilike("title", "%RLS%");
  await admin.from("items").delete().in("title", ["Staff Test Item", "No Photo Oven", "Renamed After Publishing"]);
  await admin.from("leads").delete().like("email", "%@rls.test");
  await admin.from("outreach_campaigns").delete().ilike("name", "%RLS%");
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
