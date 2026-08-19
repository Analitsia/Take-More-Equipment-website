/**
 * The order loop, end to end.
 *
 *   npm run test:orders
 *
 * Companion to test-lead-loop.mjs and test-publish-loop.mjs: walk the whole
 * feature the way it actually runs, against the real database, and assert at
 * every step.
 *
 * The loop is: two machines and a customer → an order → both machines added by
 * CODE and held → delivery quoted by distance → paid at a discount → the
 * discount lands on the machines, the reports move by what was actually taken,
 * and the customer's timeline says so → cancelled → everything is exactly where
 * it started.
 *
 * ── The assertion this file exists for ────────────────────────────────────
 *
 * Step 6. Before this feature, items.sale_price_cents was written by nothing in
 * the ops app, so every money view — which all compute revenue as
 * `coalesce(sale_price_cents, list_price_cents)` — reported ASKING prices and
 * called them revenue. A discount was invisible.
 *
 * The two machines below ask R50 000 together and sell for R45 000. If
 * money_by_month moves by R50 000, this whole feature is decoration.
 *
 * SQL goes through the Management API rather than the client SDK, because this
 * suite is about the RULES rather than the policies. packages/db/tests/rls.test.mjs
 * proves the policies through real JWTs, and the two are deliberately separate.
 */

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!ref || !token) {
  console.error("Need SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN.");
  console.error("Run with: node --env-file=.env.local scripts/test-order-loop.mjs");
  process.exit(1);
}

/**
 * Who this suite is, as far as the database is concerned.
 *
 * The Management API connects as `postgres` with no session — auth.uid() is
 * null, so app.is_staff() is false and every order RPC refuses with "Not
 * permitted". That is the guard working: confirm_order_paid() is SECURITY
 * DEFINER, and that check is the only thing between a signed-in user and the
 * sales ledger.
 *
 * So the suite has to sign in the way the app does. It borrows an existing
 * approved staff account rather than creating one: auth.users is owned by the
 * Auth service and hand-writing rows into it is how you get an account that
 * exists to Postgres and not to Supabase.
 */
let actor = null;

const sql = async (query) => {
  // Prepended to every statement rather than set once, because a pooled
  // connection does not promise the next query the same session. `false` is
  // the is_local flag: session scope, not transaction scope.
  const withActor = actor
    ? `select set_config('request.jwt.claim.sub', '${actor}', false);\n${query}`
    : query;

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: withActor }),
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
const ok = (n, d) => { passed++; console.log(`  \x1b[32mPASS\x1b[0m  ${n}${d ? `  (${d})` : ""}`); };
const fail = (n, d) => { failures.push({ name: n, detail: d }); console.log(`  \x1b[31mFAIL\x1b[0m  ${n}\n        ${d}`); };
const check = (n, condition, d) => (condition ? ok(n, d) : fail(n, d));

const num = (v) => Number(v ?? 0);

const MARK = "@orderloop.test";
const TITLE_PREFIX = "Order Loop Test ";

const cleanup = async () => {
  // Order matters: lines before orders, orders before leads (orders.lead_id is
  // ON DELETE RESTRICT), media and costs before items.
  //
  // The order is deleted by id as well as by customer, because the suite
  // deliberately runs part of itself on an order with nobody attached yet.
  const byId = orderId ? `or id = '${orderId}'` : "";
  await sql(`
    delete from public.order_lines
    where item_id in (select id from public.items where title like '${TITLE_PREFIX}%');
    delete from public.orders
    where lead_id in (select id from public.leads where email like '%${MARK}') ${byId};
    delete from public.leads where email like '%${MARK}';
    delete from public.item_media
    where item_id in (select id from public.items where title like '${TITLE_PREFIX}%');
    delete from public.item_costs
    where item_id in (select id from public.items where title like '${TITLE_PREFIX}%');
    delete from public.items where title like '${TITLE_PREFIX}%';
  `);
};

let leadId;
let orderId;
let orderCode;
/** R30 000 asking, R12 000 of cost. */
let bigId, bigSku;
/** R20 000 asking, R6 000 of cost. */
let smallId, smallSku;
/** money_by_month's revenue for this month, before anything sold. */
let revenueBefore = 0;

async function setup() {
  console.log("\nSETUP");

  const staff = await sql(`
    select user_id from public.staff_profiles
    where active and approved_at is not null
    order by case role when 'owner' then 0 when 'manager' then 1 else 2 end
    limit 1
  `);
  if (!staff[0]) {
    throw new Error("No approved staff account to run as. Approve somebody in /team first.");
  }
  actor = staff[0].user_id;
  const who = await sql(`select set_config('request.jwt.claim.sub','${actor}',false);
                         select app.staff_role() as role, app.is_staff() as staff`);
  check("the suite is signed in as approved staff", who.at(-1)?.staff === true, who.at(-1)?.role);

  const [{ id: categoryId }] = await sql(
    `select id from public.categories order by name limit 1`
  );

  const make = async (title, listCents, auctionCents, workshopCents) => {
    const [row] = await sql(`
      insert into public.items (title, category_id, condition_grade, list_price_cents,
                               retail_price_cents, description, status)
      values ('${TITLE_PREFIX}${title}', '${categoryId}', 'B', ${listCents}, ${listCents * 2},
              'A machine that exists only for the order loop test, described at length.', 'listed')
      returning id, sku
    `);
    await sql(`
      insert into public.item_costs (item_id, kind, amount_cents)
      values ('${row.id}', 'auction', ${auctionCents}),
             ('${row.id}', 'workshop', ${workshopCents})
    `);
    // A real photograph row, because the publish gate counts those and not
    // placeholders. No bytes are uploaded: nothing here fetches the image, and
    // `npm run check:launch:db` is the check that asserts bytes are reachable.
    await sql(`
      insert into public.item_media (item_id, kind, storage_path, position, is_placeholder)
      values ('${row.id}', 'photo', 'order-loop/${row.id}.jpg', 0, false)
    `);
    // Published on purpose. "Adding a machine takes it off the website" is only
    // an assertion if it was on it.
    await sql(`update public.items set published_at = now() where id = '${row.id}'`);
    return row;
  };

  const big = await make("Big", 3_000_000, 1_000_000, 200_000);
  bigId = big.id;
  bigSku = big.sku;

  const small = await make("Small", 2_000_000, 500_000, 100_000);
  smallId = small.id;
  smallSku = small.sku;

  check(
    "both machines got a four-character code",
    /^[ABCDEFGHJKMNPQRSTVWXYZ]\d{3}$/.test(bigSku) && /^[ABCDEFGHJKMNPQRSTVWXYZ]\d{3}$/.test(smallSku),
    `${bigSku}, ${smallSku}`
  );

  const [lead] = await sql(`
    insert into public.leads (full_name, email, source)
    values ('Order Loop Buyer', 'buyer${MARK}', 'walk_in')
    returning id, status
  `);
  leadId = lead.id;
  check("the customer starts as a lead, not a customer", lead.status === "new", lead.status);

  const before = await sql(`
    select coalesce(sum(revenue_cents), 0) as revenue
    from public.money_by_month
    where month = date_trunc('month', now())::date
  `);
  revenueBefore = num(before[0]?.revenue);
}

async function run() {
  console.log("\nOPENING AN ORDER");

  const [order] = await sql(
    `insert into public.orders (status) values ('draft') returning id, code`
  );
  orderId = order.id;
  orderCode = order.code;
  check("an order gets a readable number", /^ORD-\d{4}$/.test(orderCode), orderCode);

  // Typed the way somebody at a counter types it: lower case, no padding.
  const typed = bigSku[0].toLowerCase() + Number(bigSku.slice(1));
  await sql(`select public.add_order_line('${orderId}', '${typed}')`);
  await sql(`select public.add_order_line('${orderId}', '${smallSku}')`);

  let rows = await sql(
    `select count(*) as n, sum(list_price_cents) as total from public.order_lines where order_id = '${orderId}'`
  );
  check(
    `both machines went on, one of them typed as "${typed}"`,
    num(rows[0].n) === 2 && num(rows[0].total) === 5_000_000,
    `${rows[0].n} lines, R${num(rows[0].total) / 100}`
  );

  rows = await sql(
    `select status, published_at from public.items where id in ('${bigId}', '${smallId}')`
  );
  check(
    "adding a machine holds it and takes it off the website",
    rows.every((r) => r.status === "reserved" && r.published_at === null)
  );

  // Adding the same machine twice is a mistake, not a quantity — every item is
  // one physical unit, which is the premise the whole schema rests on.
  let refused = false;
  try {
    await sql(`select public.add_order_line('${orderId}', '${bigSku}')`);
  } catch {
    refused = true;
  }
  rows = await sql(`select count(*) as n from public.order_lines where order_id = '${orderId}'`);
  check("the same machine cannot go on twice", refused && num(rows[0].n) === 2, `${rows[0].n} lines`);

  // confirm_order_paid() refuses an order with nobody on it — the CHECK that
  // makes "everything is on record" true at the moment it matters rather than
  // at the moment it is inconvenient.
  let refusedWithoutBuyer = false;
  try {
    await sql(`select public.confirm_order_paid('${orderId}', 4500000, 'card_machine', null)`);
  } catch {
    refusedWithoutBuyer = true;
  }
  check("an order cannot be paid before somebody is on it", refusedWithoutBuyer);

  await sql(`update public.orders set lead_id = '${leadId}' where id = '${orderId}'`);

  console.log("\nDELIVERY");
  await sql(`
    update public.orders
       set delivery = true,
           delivery_address = '1 Test Road, Cape Town',
           delivery_km = 100,
           delivery_km_source = 'manual'
     where id = '${orderId}'
  `);
  rows = await sql(
    `select delivery_fee_cents from public.orders where id = '${orderId}'`
  );
  check(
    "100 km is R1 150, computed by the trigger and not by the caller",
    num(rows[0].delivery_fee_cents) === 115_000,
    `R${num(rows[0].delivery_fee_cents) / 100}`
  );

  // The fee is derived, so a caller cannot set it — the trigger recomputes it
  // from the distance on every write, including this one.
  await sql(`update public.orders set delivery_fee_cents = 1 where id = '${orderId}'`);
  rows = await sql(`select delivery_fee_cents from public.orders where id = '${orderId}'`);
  check(
    "a fee typed in by hand is overwritten by the rule",
    num(rows[0].delivery_fee_cents) === 115_000,
    `R${num(rows[0].delivery_fee_cents) / 100}`
  );

  console.log("\nTHE SALE  (asking R50 000, agreed R45 000)");
  await sql(
    `select public.confirm_order_paid('${orderId}', 4500000, 'card_machine', 'SLIP-1')`
  );

  rows = await sql(`
    select i.id, i.status, i.sale_price_cents, i.sold_at, i.published_at, l.sold_price_cents
    from public.order_lines l join public.items i on i.id = l.item_id
    where l.order_id = '${orderId}' order by l.position
  `);
  check(
    "the discount is split by asking price",
    num(rows[0].sale_price_cents) === 2_700_000 && num(rows[1].sale_price_cents) === 1_800_000,
    `R${num(rows[0].sale_price_cents) / 100} + R${num(rows[1].sale_price_cents) / 100}`
  );
  check(
    "and the parts sum to the whole, exactly",
    num(rows[0].sale_price_cents) + num(rows[1].sale_price_cents) === 4_500_000
  );
  check(
    "the line remembers the same figure the machine does",
    rows.every((r) => num(r.sale_price_cents) === num(r.sold_price_cents))
  );
  check(
    "both machines are sold, dated, and off the website",
    rows.every((r) => r.status === "sold" && r.sold_at !== null && r.published_at === null)
  );

  rows = await sql(
    `select status, charged_total_cents from public.orders where id = '${orderId}'`
  );
  check(
    "the customer pays the goods plus the delivery",
    rows[0].status === "paid" && num(rows[0].charged_total_cents) === 4_615_000,
    `R${num(rows[0].charged_total_cents) / 100}`
  );

  // THE assertion. R45 000 is what was taken; R50 000 is what was asked.
  rows = await sql(`
    select coalesce(sum(revenue_cents), 0) as revenue
    from public.money_by_month
    where month = date_trunc('month', now())::date
  `);
  const moved = num(rows[0].revenue) - revenueBefore;
  check(
    "the reports moved by what was TAKEN, not by what was asked",
    moved === 4_500_000,
    moved === 5_000_000
      ? "moved by R50 000 — the asking price. sale_price_cents is not reaching the views."
      : `R${moved / 100}`
  );

  rows = await sql(`
    select coalesce(sum(cost_total_cents), 0) as cost, coalesce(sum(margin_cents), 0) as margin
    from public.order_economics where order_id = '${orderId}'
  `);
  check(
    "the cost floor is the two machines' ledgers, live",
    num(rows[0].cost) === 1_800_000,
    `R${num(rows[0].cost) / 100}`
  );
  check(
    "margin is on the machines and excludes the delivery",
    num(rows[0].margin) === 2_700_000,
    `R${num(rows[0].margin) / 100}`
  );

  rows = await sql(`select status from public.leads where id = '${leadId}'`);
  check("the buyer became a customer", rows[0].status === "customer", rows[0].status);

  rows = await sql(
    `select count(*) as n from public.lead_events where lead_id = '${leadId}' and kind = 'purchased'`
  );
  check("one 'purchased' entry on their timeline, not one per machine", num(rows[0].n) === 1);

  rows = await sql(`
    select summary from public.activity_log
    where entity = 'order' and entity_id = '${orderId}' and action = 'status_changed'
  `);
  check(
    "the activity log records the sale without a cost in it",
    rows.length === 1 && !/1[28]000|18 000|12 000/.test(rows[0].summary),
    rows[0]?.summary
  );

  console.log("\nCANCELLING IT");
  await sql(`select public.void_order('${orderId}', 'Order loop test')`);

  rows = await sql(`
    select i.status, i.sale_price_cents, i.sold_at
    from public.order_lines l join public.items i on i.id = l.item_id
    where l.order_id = '${orderId}'
  `);
  check(
    "the machines come back, and the achieved price leaves with the sale",
    rows.every((r) => r.status === "listed" && r.sale_price_cents === null && r.sold_at === null)
  );

  rows = await sql(`
    select coalesce(sum(revenue_cents), 0) as revenue
    from public.money_by_month
    where month = date_trunc('month', now())::date
  `);
  check(
    "and the reports are back where they started",
    num(rows[0].revenue) === revenueBefore,
    `R${num(rows[0].revenue) / 100} vs R${revenueBefore / 100}`
  );

  rows = await sql(
    `select count(*) as n from public.lead_events where lead_id = '${leadId}' and kind = 'purchased'`
  );
  check(
    "the 'purchased' entry is NOT deleted — the timeline is what happened",
    num(rows[0].n) === 1
  );
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
