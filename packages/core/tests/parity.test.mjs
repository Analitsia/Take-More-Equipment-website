/**
 * Parity between packages/core and the database.
 *
 *   npm run test:parity
 *
 * "The website can never disagree with the ERP about what sold means" is the
 * claim the two-app architecture rests on, and it holds only while the
 * TypeScript copies of the domain rules match the SQL ones. Nothing about
 * editing one forces you to edit the other, so this is what turns that
 * intention into an enforced property.
 *
 * The SQL side is read through the Management API rather than the client SDK,
 * because the helpers being compared (app.slugify, the enum catalog) live
 * outside the schema PostgREST exposes — which is exactly where they belong.
 */

import {
  APP_ROLES,
  ITEM_STATUSES,
  SKU_PATTERN,
  TRANSITIONS,
  slugify,
} from "@takemore/core";

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!ref || !token) {
  console.error("Need SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN.");
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
  return JSON.parse(body);
};

let passed = 0;
const failures = [];
const ok = (n) => { passed++; console.log(`  \x1b[32mPASS\x1b[0m  ${n}`); };
const fail = (n, d) => { failures.push(n); console.log(`  \x1b[31mFAIL\x1b[0m  ${n}\n        ${d}`); };

const quote = (s) => `'${s.replace(/'/g, "''")}'`;

// --- status machine ---------------------------------------------------------
console.log("\nSTATUS MACHINE");
const dbTransitions = await sql(
  "select from_status, to_status, min_role, label from public.item_status_transitions"
);

const key = (from, to, role, label) => `${from} -> ${to} [${role}] ${label}`;
const fromDb = dbTransitions.map((r) => key(r.from_status, r.to_status, r.min_role, r.label)).sort();
const fromTs = TRANSITIONS.map((t) => key(t.from, t.to, t.minRole, t.label)).sort();

const onlyDb = fromDb.filter((r) => !fromTs.includes(r));
const onlyTs = fromTs.filter((r) => !fromDb.includes(r));

if (onlyDb.length === 0 && onlyTs.length === 0 && fromDb.length === fromTs.length) {
  ok(`all ${fromDb.length} transitions match row for row`);
} else {
  fail(
    "transitions match row for row",
    `only in db:\n          ${onlyDb.join("\n          ") || "(none)"}\n        only in TypeScript:\n          ${onlyTs.join("\n          ") || "(none)"}`
  );
}

// --- reversibility ----------------------------------------------------------
// Nothing in the lifecycle may be a one-way door. For every move A -> B there
// has to be a B -> A costing the same role, so anyone who can create a state can
// always put it back — a worker exploring the buttons must never strand a
// machine somewhere only their boss can retrieve it from.
//
// Checked against the DATABASE rows rather than the TypeScript ones: the trigger
// is what actually decides, and the block above has already proved the two agree.
const roleOf = new Map(
  dbTransitions.map((t) => [`${t.from_status}>${t.to_status}`, t.min_role])
);
const oneWay = [];
const mismatched = [];
for (const t of dbTransitions) {
  const inverse = `${t.to_status}>${t.from_status}`;
  if (!roleOf.has(inverse)) oneWay.push(`${t.from_status} -> ${t.to_status}`);
  else if (roleOf.get(inverse) !== t.min_role)
    mismatched.push(
      `${t.from_status} -> ${t.to_status} [${t.min_role}] but back needs [${roleOf.get(inverse)}]`
    );
}

if (oneWay.length === 0) ok("every transition has an inverse — no one-way doors");
else fail("every transition has an inverse", `no way back from:\n          ${oneWay.join("\n          ")}`);

if (mismatched.length === 0) ok("undoing a move costs the same role as making it");
else
  fail(
    "undoing a move costs the same role as making it",
    `asymmetric:\n          ${mismatched.join("\n          ")}`
  );

// --- enums ------------------------------------------------------------------
console.log("\nENUMS");
for (const [typeName, tsValues, orderMatters] of [
  ["item_status", ITEM_STATUSES, false],
  ["app_role", APP_ROLES, true],
]) {
  const rows = await sql(
    `select e.enumlabel as label
     from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = ${quote(typeName)}
     order by e.enumsortorder`
  );
  const dbValues = rows.map((r) => r.label);

  const same = orderMatters
    ? JSON.stringify(dbValues) === JSON.stringify([...tsValues])
    : JSON.stringify([...dbValues].sort()) === JSON.stringify([...tsValues].sort());

  if (same) {
    ok(
      `${typeName} matches [${dbValues.join(", ")}]` +
        (orderMatters ? " — declaration order is the privilege ladder" : "")
    );
  } else {
    fail(`${typeName} matches`, `db=[${dbValues.join(", ")}] ts=[${tsValues.join(", ")}]`);
  }
}

// --- slugify ----------------------------------------------------------------
console.log("\nSLUGIFY  (TypeScript vs app.slugify)");
const fixtures = [
  "Wash-Up",
  "6-Grid Combi Steamer",
  "Thermex 6-Grid Combi Steamer",
  "2 400 mm Wall Shelf & Utensil Rail",
  "  Trailing -- dashes  ",
  "Brûlé Oven",
  "Pass-Through Dishwasher",
];

const slugRows = await sql(
  `select ${fixtures.map((f, i) => `app.slugify(${quote(f)}) as s${i}`).join(", ")}`
);

fixtures.forEach((input, i) => {
  const fromSql = slugRows[0][`s${i}`];
  const fromTsSlug = slugify(input);
  fromSql === fromTsSlug
    ? ok(`${JSON.stringify(input)} → ${fromSql}`)
    : fail(`slugify ${JSON.stringify(input)}`, `sql=${fromSql}  ts=${fromTsSlug}`);
});

// --- SKU --------------------------------------------------------------------
console.log("\nSKU FORMAT");
const generated = await sql("select app.next_sku() as sku");
const sku = generated[0].sku;
SKU_PATTERN.test(sku)
  ? ok(`app.next_sku() emits ${sku}, which SKU_PATTERN accepts`)
  : fail("SKU_PATTERN accepts what the database generates", sku);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
