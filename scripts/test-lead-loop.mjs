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
const cleanup = async () => {
  await sql(`delete from public.leads where email like '%${MARK}'`);
  await sql(`delete from public.items where title = 'Lead Loop Test Fridge'`);
};

let itemId;

async function setup() {
  await cleanup();

  // A real, publishable machine: the publish gate wants a category, a grade, a
  // price, forty characters of description and a photo, so building one the
  // long way is also a check that the gate has not moved.
  const [{ id: categoryId }] = await sql(
    "select id from public.categories where slug = 'refrigeration'"
  );
  const [{ id: subcategoryId }] = await sql(
    `select id from public.subcategories where category_id = '${categoryId}' order by position limit 1`
  );

  const [item] = await sql(`
    insert into public.items
      (title, brand, category_id, subcategory_id, condition_grade, description, list_price_cents)
    values
      ('Lead Loop Test Fridge', 'Blue Seal', '${categoryId}', '${subcategoryId}', 'A',
       'An under counter fridge created by the lead loop suite, long enough to clear the publish gate.',
       2500000)
    returning id`);
  itemId = item.id;

  await sql(`
    insert into public.item_media (item_id, kind, external_url, is_placeholder, position)
    values ('${itemId}', 'photo', 'https://example.test/leadloop.jpg', true, 0)`);
}

async function run() {
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

  await sql(`update public.items set status = 'listed' where id = '${itemId}'`);
  await sql(`update public.items set published_at = now() where id = '${itemId}'`);

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
