/**
 * Every migration, against a real Postgres, with no credentials.
 *
 *   npm run test:schema
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Every other suite in this repo needs the production database: test:rls needs
 * real JWTs, test:parity and the loops need SUPABASE_ACCESS_TOKEN. That is the
 * right shape for testing POLICIES, which only exist in Supabase — but it left
 * a gap underneath them. A migration could be syntactically wrong, reference a
 * column that does not exist, or fail on its own constraint, and the first
 * place anyone would find out was `npm run db:apply` against the real thing.
 *
 * `supabase db reset` closes that gap and needs Docker. This closes it with a
 * WASM build of Postgres 18 from npm, which needs nothing at all — so it runs
 * on any machine and in CI on every push, next to check:launch.
 *
 * It builds the schema from zero, in order, each file in its own transaction,
 * exactly the way scripts/apply-migrations.mjs does it. Then it drives the
 * parts that are pure database — the item-code encoding, the delivery rule, the
 * renumber, the whole order loop — and checks the SQL against its TypeScript
 * twin in packages/core.
 *
 * ── What it does NOT prove ────────────────────────────────────────────────
 *
 * Nothing about RLS as a real signed-in user experiences it. This runs as the
 * owner, which bypasses row-level security; policies are proven by
 * packages/db/tests/rls.test.mjs through actual JWTs. This suite proves the
 * schema is buildable and the rules inside it are right. The two are different
 * questions and deliberately have different suites.
 *
 * The one substitution is `create extension unaccent`, which PGlite cannot do
 * and the shim provides as a function. Nothing else in any migration is changed.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkInvoiceTotals,
  deliveryFeeCents,
  formatItemCode,
  normaliseItemCode,
} from "@takemore/core";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, "..", "supabase", "migrations");
const SHIM = join(here, "..", "supabase", "tests", "supabase-shim.sql");

let passed = 0;
const failures = [];
const ok = (n, d) => { passed++; console.log(`  \x1b[32mPASS\x1b[0m  ${n}${d ? `  (${d})` : ""}`); };
const fail = (n, d) => { failures.push(n); console.log(`  \x1b[31mFAIL\x1b[0m  ${n}\n        ${d}`); };
const check = (n, cond, d) => (cond ? ok(n, d) : fail(n, d));
const num = (v) => Number(v ?? 0);

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

const read = (file) =>
  readFileSync(join(MIGRATIONS, file), "utf8").replace(
    /create extension if not exists unaccent with schema extensions;/,
    "-- [test:schema] unaccent is provided by supabase/tests/supabase-shim.sql"
  );

/** Build the schema from nothing, pausing at `before` to seed. */
async function build({ before, seed } = {}) {
  const db = await PGlite.create();
  await db.exec(readFileSync(SHIM, "utf8"));
  for (const file of files) {
    if (before && file === before && seed) await seed(db);
    try {
      await db.exec(`begin;\n${read(file)}\n;commit;`);
    } catch (error) {
      await db.exec("rollback").catch(() => {});
      throw new Error(`${file}\n        ${String(error.message).split("\n")[0]}`);
    }
  }
  return db;
}

const one = async (db, sql) => (await db.query(sql)).rows[0];
const all = async (db, sql) => (await db.query(sql)).rows;
const refuses = async (db, sql) => {
  try { await db.exec(sql); return false; } catch { return true; }
};

/**
 * Become a signed-in staff member.
 *
 * app.staff_role() reads staff_profiles by auth.uid(), and the shim's auth.uid()
 * reads `request.jwt.claim.sub` — so setting that GUC is what a JWT looks like
 * from inside a policy. `approved_at` is not optional: 20260808130000 added
 * `and approved_at is not null`, so an unapproved account has no role at all
 * and every RPC built on it refuses.
 */
async function signIn(db, role = "owner") {
  const { id } = await one(db, "insert into auth.users (email) values ('harness@test') returning id");
  await db.exec(
    `insert into public.staff_profiles (user_id, full_name, role, active, approved_at)
     values ('${id}', 'Harness', '${role}', true, now())`
  );
  await db.exec(`set request.jwt.claim.sub = '${id}'`);
  return id;
}

// ---------------------------------------------------------------------------
// 1. Does the schema build at all?
// ---------------------------------------------------------------------------
console.log(`\nBUILDING THE SCHEMA FROM ZERO  (${files.length} migrations)`);
let db;
try {
  db = await build();
  ok(`all ${files.length} migrations applied, each in its own transaction`);
} catch (error) {
  fail("the schema builds from zero", error.message);
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. The rules, against their TypeScript twins
// ---------------------------------------------------------------------------
console.log("\nITEM CODES  (SQL vs packages/core)");
for (const n of [1, 22, 998, 999, 1000, 1001, 1998, 1999, 21977, 21978, 21979]) {
  const { c } = await one(db, `select app.encode_item_code(${n}) as c`);
  check(`encode(${n}) = ${c ?? "null"}`, c === formatItemCode(n), `sql=${c} ts=${formatItemCode(n)}`);
}

console.log("\nA CODE TYPED BY HAND  (SQL vs packages/core)");
for (const raw of ["A042", "a042", "a42", "A 042", " a4 2 ", "A1", "Z999",
                   "I042", "O042", "042", "A0421", "RG-4TX", "TME-2608-0417", ""]) {
  const { c } = await one(db, `select app.normalise_item_code('${raw}') as c`);
  check(`"${raw}" -> ${c ?? "not a code"}`, c === normaliseItemCode(raw), `sql=${c} ts=${normaliseItemCode(raw)}`);
}

console.log("\nDELIVERY FEE  (SQL vs packages/core)");
for (const km of [0, 5, 9.9, 10, 10.1, 11, 20.1, 23.4, 25, 99.9, 100, 250]) {
  const { f } = await one(db, `select public.delivery_fee_cents(${km}::numeric) as f`);
  check(`${km} km = R${num(f) / 100}`, num(f) === deliveryFeeCents(km), `sql=${f} ts=${deliveryFeeCents(km)}`);
}
// Asserted as itself and not only as a match: two implementations can agree and
// both be wrong. This is the number the owner specified.
check("100 km is R1 150, as specified", deliveryFeeCents(100) === 115_000);

// ---------------------------------------------------------------------------
// 3. The renumber, on a database that already had the old codes
// ---------------------------------------------------------------------------
console.log("\nRENUMBERING  (machines created under the old scheme)");
const renumbered = await build({
  before: "20260819090000_short_item_codes.sql",
  seed: async (d) => {
    const { id: cat } = await one(d, "select id from public.categories limit 1");
    for (let i = 1; i <= 5; i++) {
      await d.exec(`insert into public.items (title, category_id, condition_grade, list_price_cents, created_at)
                    values ('Legacy ${i}', '${cat}', 'B', ${i * 100000}, now() - interval '${10 - i} days')`);
    }
    // One soft-deleted. It still holds a code against the unique index, and
    // leaving it behind would fail items_sku_shape — and would free a dead
    // machine's code to be reissued to a live one.
    await d.exec("update public.items set deleted_at = now() where title = 'Legacy 3'");
    const rows = await all(d, "select sku from public.items");
    check("the fixtures got old-format codes", rows.every((r) => /^TME-\d{4}-\d{4,}$/.test(r.sku)));
  },
});

let rows = await all(renumbered, "select title, sku from public.items order by created_at, id");
check("every machine was renumbered, oldest first",
      rows.map((r) => r.sku).join(" ") === "A001 A002 A003 A004 A005",
      rows.map((r) => `${r.title}=${r.sku}`).join(" "));
check("the soft-deleted one was renumbered too", rows.find((r) => r.title === "Legacy 3")?.sku === "A003");

rows = await all(renumbered, "select old_sku, new_sku from app.sku_renumber_2026 order by new_sku");
check("the old-to-new map was kept", rows.length === 5 && /^TME-/.test(rows[0].old_sku),
      `${rows.length} rows, ${rows[0]?.old_sku} -> ${rows[0]?.new_sku}`);

const { id: cat } = await one(renumbered, "select id from public.categories limit 1");
let r = await one(renumbered, `insert into public.items (title, category_id) values ('Next', '${cat}') returning sku`);
check("the next intake continues the sequence rather than colliding", r.sku === "A006", r.sku);

await renumbered.exec("update public.items set sku = 'B123' where title = 'Next'");
r = await one(renumbered, "select sku from public.items where title = 'Next'");
check("a code cannot be edited after it is issued", r.sku === "A006", r.sku);

check("items_sku_shape refuses anything that is not a code",
      await refuses(renumbered, "insert into public.items (title, sku) values ('Bad', 'tme-1')"));
check("and refuses a letter that is not in the alphabet",
      await refuses(renumbered, "insert into public.items (title, sku) values ('Bad', 'I042')"));

// ---------------------------------------------------------------------------
// 4. The order loop
// ---------------------------------------------------------------------------
console.log("\nA SALE, END TO END");
await signIn(db, "owner");

const { id: category } = await one(db, "select id from public.categories limit 1");
const make = async (title, list, auction, workshop) => {
  const row = await one(db, `
    insert into public.items (title, category_id, condition_grade, list_price_cents,
                              retail_price_cents, description, status)
    values ('${title}', '${category}', 'B', ${list}, ${list * 2},
            'A machine that exists only for this suite, described at some length.', 'listed')
    returning id, sku`);
  await db.exec(`insert into public.item_costs (item_id, kind, amount_cents)
                 values ('${row.id}','auction',${auction}),('${row.id}','workshop',${workshop})`);
  await db.exec(`insert into public.item_media (item_id, kind, storage_path, position, is_placeholder)
                 values ('${row.id}','photo','t/${row.id}.jpg',0,false)`);
  // Published on purpose: "adding it takes it off the website" is only an
  // assertion if it was on it.
  await db.exec(`update public.items set published_at = now() where id = '${row.id}'`);
  return row;
};

const big = await make("Big", 3_000_000, 1_000_000, 200_000);
const small = await make("Small", 2_000_000, 500_000, 100_000);
const lead = await one(db, `insert into public.leads (full_name, email, source)
                            values ('Buyer', 'b@schema.test', 'walk_in') returning id, status`);
check("the buyer starts as a lead, not a customer", lead.status === "new", lead.status);

const revenueBefore = num((await one(db, `select coalesce(sum(revenue_cents),0) r from public.money_by_month
                                          where month = date_trunc('month', now())::date`)).r);

const order = await one(db, "insert into public.orders (status) values ('draft') returning id, code");
check("an order gets a readable number", /^ORD-\d{4}$/.test(order.code), order.code);

// Typed the way somebody at a counter types it: lower case, unpadded.
const typed = big.sku[0].toLowerCase() + Number(big.sku.slice(1));
await db.exec(`select public.add_order_line('${order.id}', '${typed}')`);
await db.exec(`select public.add_order_line('${order.id}', '${small.sku}')`);

r = await one(db, `select count(*) c, sum(list_price_cents) t from public.order_lines where order_id='${order.id}'`);
check(`both machines went on, one of them typed as "${typed}"`,
      num(r.c) === 2 && num(r.t) === 5_000_000, `${r.c} lines, R${num(r.t) / 100}`);

rows = await all(db, `select status, published_at from public.items where id in ('${big.id}','${small.id}')`);
check("adding a machine holds it and takes it off the website",
      rows.every((x) => x.status === "reserved" && x.published_at === null));

check("the same machine cannot go on twice",
      await refuses(db, `select public.add_order_line('${order.id}', '${big.sku}')`));
check("an order cannot be paid before somebody is on it",
      await refuses(db, `select public.confirm_order_paid('${order.id}', 4500000, 'card_machine', null)`));

await db.exec(`update public.orders set lead_id='${lead.id}' where id='${order.id}'`);
await db.exec(`update public.orders set delivery=true, delivery_address='1 Test Rd',
               delivery_km=100, delivery_km_source='manual' where id='${order.id}'`);
r = await one(db, `select delivery_fee_cents f from public.orders where id='${order.id}'`);
check("100 km is R1 150, computed by the trigger and not by the caller", num(r.f) === 115_000, `R${num(r.f) / 100}`);

await db.exec(`update public.orders set delivery_fee_cents = 1 where id='${order.id}'`);
r = await one(db, `select delivery_fee_cents f from public.orders where id='${order.id}'`);
check("a fee typed in by hand is overwritten by the rule", num(r.f) === 115_000, `R${num(r.f) / 100}`);
check("delivery without an address is refused",
      await refuses(db, `update public.orders set delivery_address='' where id='${order.id}'`));

// Asking R50 000, agreed R45 000.
await db.exec(`select public.confirm_order_paid('${order.id}', 4500000, 'card_machine', 'SLIP-1')`);

rows = await all(db, `select i.status, i.sale_price_cents s, i.sold_at, i.published_at, l.sold_price_cents ls
                      from public.order_lines l join public.items i on i.id=l.item_id
                      where l.order_id='${order.id}' order by l.position`);
check("the discount is split pro-rata by asking price",
      num(rows[0].s) === 2_700_000 && num(rows[1].s) === 1_800_000,
      `R${num(rows[0].s) / 100} + R${num(rows[1].s) / 100}`);
check("and the parts sum to the whole, exactly", num(rows[0].s) + num(rows[1].s) === 4_500_000);
check("the line remembers the same figure the machine does", rows.every((x) => num(x.s) === num(x.ls)));
check("both machines are sold, dated, and off the website",
      rows.every((x) => x.status === "sold" && x.sold_at && x.published_at === null));

r = await one(db, `select status, charged_total_cents c from public.orders where id='${order.id}'`);
check("the customer pays the goods plus the delivery",
      r.status === "paid" && num(r.c) === 4_615_000, `R${num(r.c) / 100}`);

/**
 * The assertion this whole feature exists for.
 *
 * Nothing in the ops app ever wrote items.sale_price_cents, and every money
 * view computes revenue as coalesce(sale_price_cents, list_price_cents) — so
 * the dashboard reported ASKING prices and called them revenue. If this moves
 * by R50 000 rather than R45 000, the discount is still invisible.
 */
const revenueAfter = num((await one(db, `select coalesce(sum(revenue_cents),0) r from public.money_by_month
                                         where month = date_trunc('month', now())::date`)).r);
check("the reports moved by what was TAKEN, not by what was asked",
      revenueAfter - revenueBefore === 4_500_000,
      revenueAfter - revenueBefore === 5_000_000
        ? "moved by R50 000 — the asking price. sale_price_cents is not reaching the views."
        : `R${(revenueAfter - revenueBefore) / 100}`);

r = await one(db, `select cost_total_cents c, margin_cents m from public.order_economics where order_id='${order.id}'`);
check("the cost floor is the two ledgers, read live", num(r.c) === 1_800_000, `R${num(r.c) / 100}`);
check("margin is on the machines and excludes the delivery", num(r.m) === 2_700_000, `R${num(r.m) / 100}`);

r = await one(db, `select status from public.leads where id='${lead.id}'`);
check("the buyer became a customer", r.status === "customer", r.status);
r = await one(db, `select count(*) c from public.lead_events where lead_id='${lead.id}' and kind='purchased'`);
check("one 'purchased' entry for the order, not one per machine", num(r.c) === 1);
r = await one(db, "select summary from public.activity_log where entity='order' and action='status_changed'");
check("the activity log records the sale without a cost in it",
      /paid/.test(r.summary) && !/1800000|18 000/.test(r.summary), r.summary);

// ---------------------------------------------------------------------------
// 5. The document the customer walks out with
// ---------------------------------------------------------------------------
console.log("\nA DOCUMENT TO HAND THE CUSTOMER");

/**
 * The issuing business, as the ops app assembles it from its environment.
 *
 * Not read from a table on purpose — this repository is public and a bank
 * account number does not go in it. The registration number here is a
 * well-formed CIPC one so the shape check passes; whether it is the real one is
 * a question only the certificate can answer, which is why the ops app checks
 * the environment and this checks the schema.
 */
const issuer = (over = {}) =>
  JSON.stringify({
    legal_name: "Harness Equipment (Pty) Ltd",
    registration_number: "2026/328785/07",
    address: "1 Test Road, Cape Town",
    phone: "021 555 0134",
    email: "harness@test",
    bank: { name: "Test Bank", account_name: "Harness", type: "Current", number: "0000000000" },
    ...over,
  }).replace(/'/g, "''");

const issue = (kind, over) =>
  `select public.issue_invoice('${order.id}', '${kind}', '${issuer(over)}'::jsonb)`;

check("an invoice will not issue with the business details unconfigured",
      await refuses(db, issue("invoice", { registration_number: "" })));
/**
 * The one that would actually have shipped. apps/web/src/data/launch.ts carries
 * 0000/000000/00 as the frozen placeholder for the registration number, and an
 * invoice going out with it is a Companies Act s32 problem rather than a typo.
 */
check("nor with launch.ts's placeholder registration number",
      await refuses(db, issue("invoice", { registration_number: "0000/000000/00" })));
check("nor with a half-typed one",
      await refuses(db, issue("invoice", { registration_number: "2026/3287/07" })));
/**
 * The tripwire. Take More is not a registered VAT vendor, and heading a
 * document "tax invoice" without being one is an offence under the VAT Act
 * rather than a formatting choice. The day somebody sets a VAT number this must
 * stop them and make VAT a piece of work.
 */
check("and never with a VAT number, because this cannot issue a tax invoice",
      await refuses(db, issue("invoice", { vat_number: "4700324959" })));
check("a proforma cannot be issued for money already taken",
      await refuses(db, issue("proforma")));

r = await one(db, issue("invoice"));
let doc = r.issue_invoice;
check("the invoice run continues the spreadsheet rather than restarting it",
      doc.number === "INV-0015", doc.number);

let stored = await one(db, `select document d, total_cents t from public.order_invoices
                            where number = '${doc.number}'`);
check("the invoice asks for exactly what the order says the customer pays",
      num(stored.t) === 4_615_000 && num(stored.t) === num(
        (await one(db, `select charged_total_cents c from public.orders where id='${order.id}'`)).c
      ), `R${num(stored.t) / 100}`);

/**
 * The decision that shapes the whole document: the customer sees the ASKING
 * price of each machine and one discount line, not each machine's pro-rata
 * share of the discounted total. They negotiated "R45 000 for the pair"; they
 * never agreed to R27 000 and R18 000, and printing those makes the saving they
 * argued for vanish into two numbers they have not seen.
 */
check("each machine is billed at what it was asked for, not at its share of the discount",
      stored.d.lines.map((l) => l.total_cents).join() === "3000000,2000000",
      stored.d.lines.map((l) => l.total_cents).join());
check("and the machine's own code is on the line, so it can be identified later",
      stored.d.lines.every((l) => /^A\d{3}$/.test(l.code)),
      stored.d.lines.map((l) => l.code).join());
check("subtotal, discount and delivery add up to the total, to the cent",
      stored.d.subtotal_cents + stored.d.adjustment_cents + stored.d.delivery.fee_cents
        === stored.d.total_cents,
      `${stored.d.subtotal_cents} ${stored.d.adjustment_cents} ${stored.d.delivery.fee_cents}`);
check("the discount is shown as one line, and it is the one that was given",
      stored.d.adjustment_cents === -500_000, `${stored.d.adjustment_cents}`);
check("a paid invoice records how the money arrived",
      stored.d.payment?.method === "card_machine" && stored.d.payment?.reference === "SLIP-1");
check("and carries the issuing business's own registration number",
      stored.d.issuer.registration_number === "2026/328785/07");

/**
 * The renderer's own guard, run against what SQL actually produced.
 *
 * checkInvoiceTotals() is what stands between a document that does not add up
 * and a PDF — renderInvoicePdf() refuses rather than draws when it complains.
 * Pointing it at a real issued document is what pins the TypeScript guard to
 * the SQL that builds the thing it guards, in the one suite that needs no
 * credentials. Same idea as the delivery-fee and item-code twins above.
 */
check("the renderer's own arithmetic guard passes the document SQL built",
      checkInvoiceTotals(stored.d) === null, checkInvoiceTotals(stored.d) ?? "");
check("and it catches a document that does not add up",
      checkInvoiceTotals({ ...stored.d, total_cents: stored.d.total_cents + 1 }) !== null);

/**
 * The reason this is a stored document and not a view over `orders`.
 *
 * Rename the machine after the customer has walked out with the paper. A
 * re-rendered invoice would now describe a machine by a name that was never on
 * their copy — silently, and visibly only to them.
 */
await db.exec(`update public.items set title = 'Renamed After The Fact' where id = '${big.id}'`);
stored = await one(db, `select document d from public.order_invoices where number = '${doc.number}'`);
check("renaming the machine afterwards does not rewrite the invoice already handed over",
      !JSON.stringify(stored.d).includes("Renamed After The Fact"),
      stored.d.lines.map((l) => l.description).join(" | "));

console.log("\nCORRECTING IT, AND CANCELLING IT");
check("a paid order cannot be edited back into a draft",
      await refuses(db, `update public.orders set status='draft' where id='${order.id}'`));

await db.exec(`select public.reopen_order('${order.id}')`);
rows = await all(db, `select i.status, i.sale_price_cents s from public.order_lines l
                      join public.items i on i.id=l.item_id where l.order_id='${order.id}'`);
check("reopening un-sells the machines and the achieved price goes with the sale",
      rows.every((x) => x.status === "reserved" && x.s === null));
r = await one(db, `select status, paid_at, sold_total_cents t from public.orders where id='${order.id}'`);
check("and the order is open again carrying no payment", r.status === "draft" && !r.paid_at && r.t === null);

/**
 * The proforma, on an order that is open again and carrying no agreed figure.
 *
 * This is the shape somebody paying by EFT actually needs — a document with the
 * banking details on it to pay AGAINST — and it is the branch where
 * sold_total_cents is null, so the asking price is what gets asked for. Its own
 * number series, so a gap in the invoice run is never explained as "that one
 * was a quote".
 */
check("an invoice cannot be issued for money that has not arrived",
      await refuses(db, issue("invoice")));
r = await one(db, issue("proforma"));
check("a proforma gets its own series, not a number out of the invoice run",
      r.issue_invoice.number === "PRO-0001", r.issue_invoice.number);
check("and with nothing agreed yet it asks for the asking price plus the delivery",
      num(r.issue_invoice.total_cents) === 5_115_000, `R${num(r.issue_invoice.total_cents) / 100}`);

await db.exec(`select public.confirm_order_paid('${order.id}', 4500000, 'bank_transfer', 'EFT-9')`);

/**
 * Correcting a document that has left the building is a second document that
 * says so, never an edit to the first. Same posture as the note reopen_order()
 * writes onto the customer's timeline.
 */
r = await one(db, issue("invoice"));
check("a corrected sale issues a fresh invoice rather than editing the old one",
      r.issue_invoice.number === "INV-0016", r.issue_invoice.number);
check("and the new one records which document it replaces",
      r.issue_invoice.supersedes !== null);
r = await one(db, `select count(*) c from public.order_invoices where order_id='${order.id}'`);
check("both invoices and the proforma are all still on the record", num(r.c) === 3, `${r.c}`);

await db.exec(`select public.void_order('${order.id}', 'Finance fell through')`);

check("a cancelled sale has nothing left to invoice", await refuses(db, issue("invoice")));
r = await one(db, `select count(*) c from public.order_invoices where order_id='${order.id}'`);
check("but the documents already issued survive the cancellation", num(r.c) === 3, `${r.c}`);

rows = await all(db, `select i.status, i.sale_price_cents s, i.sold_at from public.order_lines l
                      join public.items i on i.id=l.item_id where l.order_id='${order.id}'`);
check("cancelling puts the machines back and clears what they sold for",
      rows.every((x) => x.status === "listed" && x.s === null && x.sold_at === null));

const revenueEnd = num((await one(db, `select coalesce(sum(revenue_cents),0) r from public.money_by_month
                                       where month = date_trunc('month', now())::date`)).r);
check("and the reports are back where they started", revenueEnd === revenueBefore,
      `R${revenueEnd / 100} vs R${revenueBefore / 100}`);

r = await one(db, `select count(*) c from public.lead_events where lead_id='${lead.id}' and kind='purchased'`);
check("both 'purchased' entries survive — a timeline is what happened", num(r.c) === 2, `${r.c}`);
rows = await all(db, `select body from public.lead_events where lead_id='${lead.id}' and kind='note'`);
check("reopening explained itself, so two purchases do not read as two sales",
      rows.some((x) => /reopened to correct/.test(x.body)), rows.map((x) => x.body).join(" | "));
check("and the cancellation gave its reason",
      rows.some((x) => /Finance fell through/.test(x.body)));

console.log("\nA MACHINE FROM THE WORKSHOP");
/**
 * The one that was quietly wrong until 20260819110100.
 *
 * A machine still in pieces on the bench can be sold — somebody sees it and
 * wants it, and refusing that would be the software disagreeing with the
 * business. What must not happen is the machine coming back marked "For sale"
 * when the sale falls through, because then the board is telling the workshop
 * something the workshop knows to be untrue.
 */
const bench = await one(db, `
  insert into public.items (title, category_id, condition_grade, list_price_cents,
                            retail_price_cents, description, status)
  values ('Half stripped', '${category}', 'C', 800000, 1600000,
          'A machine that is in the workshop, described at some length here.', 'refurbishing')
  returning id, sku`);

const bench_order = await one(db, "insert into public.orders (status) values ('draft') returning id, code");
await db.exec(`select public.add_order_line('${bench_order.id}', '${bench.sku}')`);

r = await one(db, `select status from public.items where id='${bench.id}'`);
check("a machine in the workshop can still be put on an order", r.status === "reserved", r.status);
r = await one(db, `select held_from_status h from public.order_lines where item_id='${bench.id}'`);
check("and the line writes down where it came from", r.h === "refurbishing", r.h);

await db.exec(`select public.void_order('${bench_order.id}', 'They went away to think about it')`);
r = await one(db, `select status from public.items where id='${bench.id}'`);
check("cancelling puts it back IN THE WORKSHOP, not on sale", r.status === "refurbishing", r.status);

/** A line written before the column existed still has to be safe to cancel. */
const legacy = await make("Legacy", 500000, 100000, 0);
const legacy_order = await one(db, "insert into public.orders (status) values ('draft') returning id");
await db.exec(`select public.add_order_line('${legacy_order.id}', '${legacy.sku}')`);
await db.exec(`update public.order_lines set held_from_status = null where item_id='${legacy.id}'`);
await db.exec(`select public.void_order('${legacy_order.id}', 'Nobody remembers')`);
r = await one(db, `select status from public.items where id='${legacy.id}'`);
check("a line that remembers nothing falls back to For sale, as it always did",
      r.status === "listed", r.status);

console.log("\nTHE WORKSHOP IS NOT A SHOPFRONT");
/**
 * 20260820100000. A machine on the bench has no settled price — the repair is
 * not costed until it is finished — so it does not go on the website, and one
 * that goes BACK to the bench comes off it.
 */
const bench2 = await make("Back to the bench", 900_000, 300_000, 0);
r = await one(db, `select published_at p from public.items where id='${bench2.id}'`);
check("a machine for sale is on the website", r.p !== null);

await db.exec(`update public.items set status = 'refurbishing' where id='${bench2.id}'`);
r = await one(db, `select status, published_at p from public.items where id='${bench2.id}'`);
check("sending it back to the workshop takes it off the website",
      r.status === "refurbishing" && r.p === null, `${r.status}, published_at=${r.p}`);

check("and it cannot be put back up while it is in there",
      await refuses(db, `update public.items set published_at = now() where id='${bench2.id}'`));

await db.exec(`update public.items set status = 'listed' where id='${bench2.id}'`);
await db.exec(`update public.items set published_at = now() where id='${bench2.id}'`);
r = await one(db, `select published_at p from public.items where id='${bench2.id}'`);
check("tapping For sale once it is priced puts it back on the same page", r.p !== null);

console.log("\nTHE PICKER");
rows = await all(db, `select sku, rank from public.search_sellable_items('${typed}', 10, null)`);
check("a typed code finds the machine and outranks everything else",
      rows[0]?.sku === big.sku && rows[0]?.rank === 0, rows.map((x) => `${x.sku}#${x.rank}`).join(" "));
rows = await all(db, `select id from public.search_everything('${typed}', 10)`);
check("and the command palette finds it too", rows.some((x) => x.id === big.id), `${rows.length} hits`);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
