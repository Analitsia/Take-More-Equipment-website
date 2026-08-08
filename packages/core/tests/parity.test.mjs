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
  LEAD_EVENT_KINDS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  OUTREACH_CHANNELS,
  OUTREACH_STATES,
  SKU_PATTERN,
  STAGES,
  TRANSITIONS,
  normalisePhone,
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

// --- reachability -----------------------------------------------------------
// Every stage must reach every other stage DIRECTLY, at one role. That is what
// makes the four buttons in the ops app honest: they are always all offered, so
// every one of them has to work from wherever the machine currently is. A gap
// here would render as a button that silently fails.
//
// It also subsumes reversibility — a complete graph is symmetric by definition,
// so no separate "is there a way back" check is needed.
//
// Checked against the DATABASE rows rather than the TypeScript ones: the trigger
// is what actually decides, and the block above has already proved the two agree.
const edge = new Map(
  dbTransitions.map((t) => [`${t.from_status}>${t.to_status}`, t.min_role])
);
const missing = [];
for (const from of STAGES) {
  for (const to of STAGES) {
    if (from.status === to.status) continue;
    if (!edge.has(`${from.status}>${to.status}`)) missing.push(`${from.status} -> ${to.status}`);
  }
}

if (missing.length === 0)
  ok(`all ${STAGES.length} stages reach each other in one move — no dead ends`);
else
  fail(
    "all stages reach each other in one move",
    `no direct move for:\n          ${missing.join("\n          ")}`
  );

const roles = [...new Set(dbTransitions.map((t) => t.min_role))];
if (roles.length === 1 && roles[0] === "staff")
  ok("every stage change costs the same role — nobody can strand a machine");
else
  fail(
    "every stage change costs the same role",
    `expected only [staff], found [${roles.join(", ")}]`
  );

// Nothing may point at a retired status. They survive in the Postgres enum only
// because a value cannot be dropped; their absence from this table is the sole
// thing keeping them unreachable, so a stray row here would quietly revive one.
const live = new Set(STAGES.map((s) => s.status));
const revived = dbTransitions
  .filter((t) => !live.has(t.from_status) || !live.has(t.to_status))
  .map((t) => `${t.from_status} -> ${t.to_status}`);
if (revived.length === 0) ok("no transition mentions a retired status");
else
  fail("no transition mentions a retired status", `found:\n          ${revived.join("\n          ")}`);

// --- enums ------------------------------------------------------------------
console.log("\nENUMS");
for (const [typeName, tsValues, orderMatters] of [
  ["item_status", ITEM_STATUSES, false],
  ["app_role", APP_ROLES, true],
  // The lead vocabulary. Order carries no meaning in any of these — unlike
  // app_role, nothing compares them with `>=` — so they are checked as sets.
  ["lead_source", LEAD_SOURCES, false],
  ["lead_status", LEAD_STATUSES, false],
  ["lead_event_kind", LEAD_EVENT_KINDS, false],
  ["outreach_channel", OUTREACH_CHANNELS, false],
  ["outreach_state", OUTREACH_STATES, false],
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

// --- phone ------------------------------------------------------------------
/**
 * The one that would hurt most quietly.
 *
 * leads.phone_e164 is a GENERATED column over app.normalise_za_phone, and a
 * partial unique index sits on it — so if the TypeScript copy disagreed, the ops
 * form would show a worker one number while the database identified them by
 * another, and the same customer would silently become two rows. Nothing would
 * error. This is the only thing that would notice.
 */
console.log("\nPHONE NUMBERS  (TypeScript vs app.normalise_za_phone)");
const phones = [
  "082 123 4567",
  "0821234567",
  "+27 82 123 4567",
  "+27 (0)82 123-4567",
  "+27(0)821234567",
  "0027821234567",
  "27821234567",
  "821234567",
  "021 555 0134",
  "+264 61 123456",
  "  082 123 4567  ",
  "082-123-4567",
  "1234",
  "",
];

const phoneRows = await sql(
  `select ${phones
    .map((p, i) => `app.normalise_za_phone(${quote(p)}) as p${i}`)
    .join(", ")}`
);

phones.forEach((input, i) => {
  const fromSql = phoneRows[0][`p${i}`] ?? null;
  const fromTs = normalisePhone(input);
  fromSql === fromTs
    ? ok(`${JSON.stringify(input)} → ${fromSql ?? "null"}`)
    : fail(`normalise ${JSON.stringify(input)}`, `sql=${fromSql}  ts=${fromTs}`);
});

// Every South African spelling above has to land on ONE string, or the unique
// index cannot do its job.
const za = phones
  .slice(0, 8)
  .map((p) => normalisePhone(p))
  .filter(Boolean);
new Set(za).size === 1
  ? ok(`all eight spellings of one number collapse to ${za[0]}`)
  : fail("every spelling collapses to one identity", [...new Set(za)].join(", "));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
