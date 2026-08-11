/**
 * The lead loop, end to end.
 *
 *   npm run test:leads
 *
 * Companion to test-publish-loop.mjs, and the same idea: walk the whole feature
 * the way it actually runs, against the real database, and assert at every step.
 *
 * The loop is: a stranger enquires from the website → they become one person,
 * not three → a matching machine goes live → exactly one suggestion is queued →
 * running the matcher again queues nothing → they opt out → nothing is ever
 * queued for them again.
 *
 * SQL is reached through the Management API rather than the client SDK, because
 * this suite is about the RULES, not the policies — packages/db/tests/rls.test.mjs
 * is what proves the policies, through real JWTs, and the two are deliberately
 * separate. Anything this file asserts is true for the service key as well, which
 * is the point: these are constraints, not permissions.
 */

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!ref || !token) {
  console.error("Need SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN.");
  console.error("Run with: node --env-file=.env.local scripts/test-lead-loop.mjs");
  process.exit(1);
}

const sql = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(body);
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

let passed = 0;
const failures = [];
const ok = (n, d) => {
  passed++;
  console.log(`  \x1b[32mPASS\x1b[0m  ${n}${d ? `  (${d})` : ""}`);
};
const fail = (n, d) => {
  failures.push({ name: n, detail: d });
  console.log(`  \x1b[31mFAIL\x1b[0m  ${n}\n        ${d}`);
};
const check = (n, condition, d) => (condition ? ok(n, d) : fail(n, d));

const MARK = "@leadloop.test";
const TITLE_PREFIX = "Lead Loop Test ";
const cleanup = async () => {
  await sql(`delete from public.leads where email like '%${MARK}'`);
  await sql(`delete from public.items where title like '${TITLE_PREFIX}%'`);
};

let itemId;
/** A second machine, answering a completely different want. */
let stoveId;
/** A third, answering the SAME want as the first. */
let secondFridgeId;

/**
 * A real, publishable machine.
 *
 * The publish gate wants a category, a grade, a price, forty characters of
 * description and a photo, so building one the long way is also a check that
 * the gate has not moved.
 *
 * The photo row is REAL, not a placeholder. This fixture used to attach
 * `is_placeholder: true` and publish on it, which the schema allowed because
 * the publish gate counted any photo at all. It no longer does —
 * 20260809090000_no_placeholders_on_published.sql requires a storage_path, so
 * an item cannot go live on a stock image.
 *
 * No object is uploaded to Storage for it: nothing in this suite fetches the
 * image, the row is deleted at the end of the run, and the publish gate cares
 * that a real photograph was recorded, not that the bytes are reachable.
 * `npm run check:launch:db` is the check that asserts bytes are reachable.
 */
async function makeItem({ title, categorySlug, description, priceCents }) {
  const [{ id: categoryId }] = await sql(
    `select id from public.categories where slug = '${categorySlug}'`
  );
  const [{ id: subcategoryId }] = await sql(
    `select id from public.subcategories where category_id = '${categoryId}' order by position limit 1`
  );

  const [item] = await sql(`
    insert into public.items
      (title, brand, category_id, subcategory_id, condition_grade, description, list_price_cents)
    values
      ('${TITLE_PREFIX}${title}', 'Blue Seal', '${categoryId}', '${subcategoryId}', 'A',
       '${description}', ${priceCents})
    returning id`);

  await sql(`
    insert into public.item_media (item_id, kind, storage_path, is_placeholder, position)
    values ('${item.id}', 'photo', 'items/${item.id}/lead-loop-fixture.webp', false, 0)`);

  return item.id;
}

/** Live and for sale, which is the only state the matcher will speak about. */
const publish = (id) =>
  sql(`update public.items set status = 'listed', published_at = now() where id = '${id}'`);

async function setup() {
  await cleanup();

  itemId = await makeItem({
    title: "Fridge",
    categorySlug: "refrigeration",
    description:
      "An under counter fridge created by the lead loop suite, long enough to clear the publish gate.",
    priceCents: 2500000,
  });

  stoveId = await makeItem({
    title: "Stove",
    categorySlug: "cooking",
    description:
      "A six burner gas stove created by the lead loop suite, long enough to clear the publish gate.",
    priceCents: 1800000,
  });

  secondFridgeId = await makeItem({
    title: "Second Fridge",
    categorySlug: "refrigeration",
    description:
      "Another under counter fridge from the lead loop suite, long enough to clear the publish gate.",
    priceCents: 2400000,
  });
}

async function run() {
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nSCHEMA  (there is exactly one capture_lead)");
  // ─────────────────────────────────────────────────────────────────────────
  //
  // 20260809090100_lead_capture_ceilings.sql replaces capture_lead() wholesale,
  // because plpgsql has no way to patch a function body. `create or replace`
  // only REPLACES when the signature matches exactly — a changed default, a
  // reordered parameter, `text` where the original said `bigint`, and Postgres
  // silently creates an OVERLOAD instead.
  //
  // At that point PostgREST has two candidates and picks between them by rules
  // nobody on this project has memorised. Half the enquiries would hit the old
  // ceilings and nothing anywhere would error. This is the assertion that makes
  // that failure loud, and it costs one query.
  {
    const rows = await sql(`
      select count(*)::int as n
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'capture_lead'`);
    const n = rows[0]?.n;
    check(
      "capture_lead was replaced, not overloaded",
      n === 1,
      n === 1 ? "1 definition" : `${n} definitions — PostgREST would choose unpredictably`
    );
  }

  console.log("\nCAPTURE  (what the website does)");

  await sql(`select public.capture_lead(
    p_email => 'buyer${MARK}',
    p_name  => 'Nomsa Dlamini',
    p_phone => '082 555 1212',
    p_message => 'under counter fridge for cold drinks at the shop',
    p_category_slug => 'refrigeration',
    p_email_consent => true
  )`);

  let rows = await sql(`
    select id, full_name, phone_e164, source,
           email_consent_at is not null as consented,
           (select count(*) from public.lead_interests i where i.lead_id = l.id) as interests
    from public.leads l where email = 'buyer${MARK}'`);

  check("one person is created", rows.length === 1);
  check("their number is stored in one canonical spelling", rows[0]?.phone_e164 === "+27825551212", rows[0]?.phone_e164);
  check("the source is set by the server, not the caller", rows[0]?.source === "website_general", rows[0]?.source);
  check("consent is recorded as given", rows[0]?.consented === true);
  check("what they want is recorded", Number(rows[0]?.interests) === 1);

  const leadId = rows[0].id;

  console.log("\nIDENTITY  (the same person, spelled three ways)");
  await sql(`select public.capture_lead(
    p_email => 'BUYER${MARK.toUpperCase()}',
    p_message => 'and a chest freezer if you get one'
  )`);
  await sql(`select public.capture_lead(
    p_email => 'someone-else${MARK}',
    p_phone => '+27 (0)82 555 1212'
  )`);

  rows = await sql(`select count(*)::int as n from public.leads where phone_e164 = '+27825551212'`);
  check("a second enquiry does not create a second person", rows[0].n === 1, `${rows[0].n} rows`);

  rows = await sql(
    `select count(*)::int as n from public.lead_interests where lead_id = '${leadId}'`
  );
  check("but each enquiry is kept as its own want", rows[0].n >= 2, `${rows[0].n} interests`);

  console.log("\nMATCHING  (a machine arrives)");
  let matched = await sql(`select public.match_item_to_leads('${itemId}') as n`);
  check("a draft machine is never matched", matched[0].n === 0, "not published yet");

  await publish(itemId);

  matched = await sql(`select public.match_item_to_leads('${itemId}') as n`);
  check("a live machine matching their category queues one suggestion", matched[0].n === 1, `${matched[0].n} queued`);

  rows = await sql(`
    select channel, match_score, reason, state
    from public.outreach_messages where lead_id = '${leadId}'`);
  check("queued on the channel they consented to", rows[0]?.channel === "email", rows[0]?.channel);
  check("the reason is written for a human to audit", (rows[0]?.reason ?? "").length > 15, rows[0]?.reason);

  matched = await sql(`select public.match_item_to_leads('${itemId}') as n`);
  check("running the matcher again queues nothing", matched[0].n === 0, "outreach_once");

  rows = await sql(
    `select count(*)::int as n from public.outreach_messages where lead_id = '${leadId}'`
  );
  check("still exactly one message row", rows[0].n === 1, `${rows[0].n} rows`);

  rows = await sql(`
    select m.interest_id, i.description
    from public.outreach_messages m
    join public.lead_interests i on i.id = m.interest_id
    where m.lead_id = '${leadId}'`);
  check(
    "the suggestion records WHICH want it answers",
    rows.length === 1 && !!rows[0].interest_id,
    rows[0]?.description
  );

  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nTWO WANTS  (a fryer in March, a cold room in June)");
  // ─────────────────────────────────────────────────────────────────────────
  //
  // The reason lead_interests is its own table, finally carried through to
  // outreach. This person is still waiting on the fridge draft above. A second
  // machine answering a DIFFERENT want must not be silenced by it, and a second
  // machine answering the SAME want must be — one message about one machine,
  // one pending draft per thing they asked for.
  //
  // Both halves are asserted, because getting either one alone is easy and
  // getting both is the whole feature: relax the guard and a delivery of six
  // fridges puts six drafts in front of staff for the same customer; leave it
  // per-person and somebody who asked for two different machines only ever
  // hears about one of them.
  const [{ id: cookingId }] = await sql(
    "select id from public.categories where slug = 'cooking'"
  );
  await sql(`
    insert into public.lead_interests (lead_id, category_id, description)
    values ('${leadId}', '${cookingId}',
            'six burner gas stove for the new kitchen in Woodstock')`);

  await publish(stoveId);
  matched = await sql(`select public.match_item_to_leads('${stoveId}') as n`);
  check(
    "a machine answering their OTHER want still gets through",
    matched[0].n === 1,
    "a pending fridge draft does not silence the stove"
  );

  await publish(secondFridgeId);
  matched = await sql(`select public.match_item_to_leads('${secondFridgeId}') as n`);
  check(
    "but a second machine answering the SAME want does not",
    matched[0].n === 0,
    "one pending draft per want, not per delivery"
  );

  rows = await sql(`
    select count(*)::int as messages,
           count(distinct interest_id)::int as wants,
           count(distinct item_id)::int as machines
    from public.outreach_messages
    where lead_id = '${leadId}' and state = 'queued'`);
  check(
    "so they have two drafts waiting, one machine each",
    rows[0].messages === 2 && rows[0].wants === 2 && rows[0].machines === 2,
    `${rows[0].messages} messages · ${rows[0].wants} wants · ${rows[0].machines} machines`
  );

  // Back to one machine, one want and one message, so everything below reads
  // the same as it did before this section existed — including the final
  // assertion, which counts what the nightly sweep queues across ALL stock.
  // Dropping the two extra machines takes the stove's draft with it, because
  // outreach_messages.item_id cascades.
  await sql(`
    delete from public.items where id in ('${stoveId}', '${secondFridgeId}');
    delete from public.lead_interests where lead_id = '${leadId}' and category_id = '${cookingId}'`);

  console.log("\nJUDGEMENT  (a human says no)");
  await sql(`update public.outreach_messages set state = 'skipped' where lead_id = '${leadId}'`);
  matched = await sql(`select public.match_item_to_leads('${itemId}') as n`);
  check("a rejected suggestion is not offered again tonight", matched[0].n === 0);

  console.log("\nBUDGET  (a ceiling they gave us)");
  await sql(`
    delete from public.outreach_messages where lead_id = '${leadId}';
    update public.lead_interests set budget_max_cents = 1000000 where lead_id = '${leadId}'`);
  matched = await sql(`select public.match_item_to_leads('${itemId}') as n`);
  check("a machine well over their budget is not offered", matched[0].n === 0, "R25 000 against a R10 000 ceiling");

  await sql(
    `update public.lead_interests set budget_max_cents = 2300000 where lead_id = '${leadId}'`
  );
  matched = await sql(`select public.match_item_to_leads('${itemId}') as n`);
  check("but ten percent over is still worth telling them about", matched[0].n === 1, "R25 000 against a R23 000 ceiling");

  console.log("\nOPTING OUT  (and it has to stick)");
  rows = await sql(`select unsubscribe_token from public.leads where id = '${leadId}'`);
  const done = await sql(`select public.unsubscribe('${rows[0].unsubscribe_token}') as ok`);
  check("the one-click link works", done[0].ok === true);

  rows = await sql(`
    select count(*)::int as n from public.lead_events
    where lead_id = '${leadId}' and kind = 'unsubscribed'`);
  check("opting out writes its own audit entry", rows[0].n === 1);

  await sql(`delete from public.outreach_messages where lead_id = '${leadId}'`);
  matched = await sql(`select public.match_item_to_leads('${itemId}') as n`);
  check("nothing is ever queued for them again", matched[0].n === 0);

  rows = await sql(`select public.run_stock_match() as n`);
  check("and the nightly sweep does not resurrect them", Number(rows[0].n) === 0, `${rows[0].n} queued across all stock`);
}

try {
  await setup();
  await run();
} catch (error) {
  fail("suite", error.message?.slice(0, 500) ?? String(error));
} finally {
  await cleanup();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  process.exit(1);
}
