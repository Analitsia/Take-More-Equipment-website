/**
 * Regenerate packages/db/src/types.generated.ts from the live schema.
 *
 *   npm run db:types
 *
 * Wraps the CLI so the "do not edit" header survives regeneration — a generated
 * file with no marking gets hand-edited eventually, and then silently reverted
 * by the next person who runs this.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const PROJECT_REF = "btiyizeyjedleeaddxuh";
const OUT = "packages/db/src/types.generated.ts";

const HEADER = `/**
 * GENERATED — do not edit.
 *
 *   npm run db:types
 *
 * Regenerate after every migration. A stale file here is a type system that
 * confidently describes a schema that no longer exists.
 *
 * Two things the generator cannot know, both handled in the schema rather than
 * worked around at call sites:
 *   - trigger-populated NOT NULL columns look required on insert, which is why
 *     items.sku and items.slug carry column defaults;
 *   - a view's nullability is unknowable, so every column of public_items
 *     arrives as \`T | null\`. Narrow once, in a typed query helper.
 */

`;

// Resolve the real executable rather than the .bin shim: Node refuses to
// spawnSync a Windows .cmd file directly (EINVAL), and going through a shell
// instead would mean quoting arguments by hand.
const require = createRequire(import.meta.url);
const supabaseBin = require("supabase/package.json");
const binPath = require.resolve(
  `supabase/${typeof supabaseBin.bin === "string" ? supabaseBin.bin : supabaseBin.bin.supabase}`
);

const output = execFileSync(
  process.execPath,
  [binPath, "gen", "types", "typescript", "--project-id", PROJECT_REF, "--schema", "public"],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
);

if (!output.includes("export type Database")) {
  console.error("Generator produced no Database type — refusing to overwrite.");
  console.error(output.slice(0, 500));
  process.exit(1);
}

writeFileSync(OUT, HEADER + output, "utf8");
console.log(`Wrote ${OUT} (${output.length} bytes).`);
