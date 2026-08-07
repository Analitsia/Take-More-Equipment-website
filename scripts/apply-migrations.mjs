/**
 * Apply supabase/migrations to the linked project via the Management API.
 *
 * WHY THIS EXISTS
 * ---------------
 * `supabase db push` connects straight to db.<ref>.supabase.co, which resolves
 * to an AAAA record only. On an IPv4-only network — which this one is — that
 * connection cannot be made at all, and the CLI's own suggestion (`supabase
 * link` to set up an IPv4 pooler route) currently fails on a response-parsing
 * bug in CLI 2.112.0 against the 2026 API.
 *
 * The Management API's SQL endpoint takes the same DDL over HTTPS, runs it as
 * `postgres`, and needs no database password. It is the same mechanism the
 * Supabase MCP server's apply_migration tool uses.
 *
 * Once the network has IPv6, or the CLI bug is fixed, `npm run db:push` is the
 * better tool and this can go away. Until then this keeps
 * supabase_migrations.schema_migrations correctly populated, so the CLI's own
 * view of what is applied stays accurate.
 *
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/apply-migrations.mjs [--dry-run]
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "supabase", "migrations");

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const dryRun = process.argv.includes("--dry-run");

if (!ref || !token) {
  console.error("Need SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN in the environment.");
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function sql(query) {
  const res = await fetch(endpoint, {
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
}

// `version` is the leading timestamp, `name` the rest — the same split the CLI
// uses, so a later `supabase migration list` lines up.
const parse = (file) => {
  const match = /^(\d+)_(.+)\.sql$/.exec(file);
  return match ? { version: match[1], name: match[2], file } : null;
};

const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map(parse)
  .filter(Boolean);

console.log(`${migrations.length} migration(s) in ${migrationsDir}\n`);

await sql(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);`);

const appliedRows = await sql(
  "select version from supabase_migrations.schema_migrations order by version"
);
const applied = new Set((appliedRows ?? []).map((r) => r.version));

let ran = 0;
for (const migration of migrations) {
  const label = `${migration.version}_${migration.name}`;

  if (applied.has(migration.version)) {
    console.log(`  skip     ${label}  (already applied)`);
    continue;
  }
  if (dryRun) {
    console.log(`  would run ${label}`);
    continue;
  }

  const body = readFileSync(join(migrationsDir, migration.file), "utf8");
  process.stdout.write(`  apply    ${label} ... `);
  try {
    await sql(body);
    // Recorded only after the DDL succeeds, so a failed migration is not
    // remembered as done.
    await sql(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ('${migration.version}', '${migration.name.replace(/'/g, "''")}')
       on conflict (version) do nothing`
    );
    console.log("ok");
    ran++;
  } catch (error) {
    console.log("FAILED\n");
    console.error(String(error.message ?? error).slice(0, 4000));
    console.error(`\nStopped at ${label}. Earlier migrations remain applied.`);
    process.exit(1);
  }
}

console.log(`\nDone. ${ran} applied, ${migrations.length - ran} already present.`);
