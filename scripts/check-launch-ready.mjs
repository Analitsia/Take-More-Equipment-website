/**
 * Is this website telling the truth?
 *
 *   npm run check:launch          # everything that needs no credentials
 *   npm run check:launch:db       # the above, plus checks against the database
 *
 * WHY THIS EXISTS
 * ---------------
 * apps/web/next.config.mjs used to carry this comment:
 *
 *     "Real media never comes from here — item_media marks these
 *      is_placeholder and CI refuses a production deploy that contains any."
 *
 * There was no CI. There was no check. There were four stock photographs, nine
 * invented customer testimonials with names and Cape Town suburbs attached, an
 * invented phone number on every CTA, four unverified statistics, and a blog
 * whose own header called its rand figures illustrative. The claim was the only
 * thing standing between all of that and a public domain, and it was false.
 *
 * This script is that claim, made true. It runs on every push and pull request,
 * needs no secrets, and takes about a fifth of a second.
 *
 * HOW IT DECIDES
 * --------------
 * Nothing here greps for magic strings like "PLACEHOLDER" or "TODO". Comments
 * are not enforcement — that is the whole lesson of the paragraph above. It
 * reads apps/web/src/data/launch.ts, where every public claim is recorded
 * alongside whether anybody has verified it, and compares each value against
 * the frozen mockup original. "Unfilled" means "still equal to what the mockup
 * shipped", which cannot be faked by editing a comment.
 *
 * WARNINGS VERSUS FAILURES
 * ------------------------
 * Some rules always fail: a stock photo URL outside the manifest, a fact marked
 * verified that is still the placeholder, a malformed phone number, an
 * undocumented environment variable. Those are wrong at any stage.
 *
 * The rest — "this is not verified yet" — are warnings while
 * `launchState` is "pre-launch" and failures once it is "live". That switch
 * lives inside launch.ts, so the file Carlo is already editing is the file that
 * arms the gate. CI never needs touching at cutover.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const WEB_SRC = join(ROOT, "apps", "web", "src");
const MANIFEST = join(WEB_SRC, "data", "launch.ts");

const withDb = process.argv.includes("--db");

// ── Output ─────────────────────────────────────────────────────────────────
// Matches the house style of the other harnesses in scripts/.

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, text) => (colour ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (t) => c("32", t);
const red = (t) => c("31", t);
const yellow = (t) => c("33", t);
const dim = (t) => c("2", t);
const bold = (t) => c("1", t);

let passed = 0;
const failures = [];
const warnings = [];

const pass = (what) => {
  passed++;
  console.log(`  ${green("PASS")}  ${what}`);
};

const fail = (what, detail) => {
  failures.push({ what, detail });
  console.log(`  ${red("FAIL")}  ${what}`);
  if (detail) for (const line of [].concat(detail)) console.log(`        ${dim(line)}`);
};

const warn = (what, detail) => {
  warnings.push({ what, detail });
  console.log(`  ${yellow("WARN")}  ${what}`);
  if (detail) for (const line of [].concat(detail)) console.log(`        ${dim(line)}`);
};

const section = (name) => console.log(`\n${bold(name)}`);

/**
 * A rule that is fatal at launch and advisory before it.
 * This is the only place launchState is consulted.
 */
let strict = false;
const requireVerified = (what, detail) => (strict ? fail(what, detail) : warn(what, detail));

// ── Load the manifest ──────────────────────────────────────────────────────
// Imported, not parsed. Node runs TypeScript directly (>=22.18), so the gate
// checks the same objects the website renders rather than a regex's opinion of
// them — which means a refactor cannot leave the gate quietly checking nothing.

const manifest = await import(pathToFileURL(MANIFEST).href);
const {
  launchState,
  contact,
  claims,
  testimonials,
  media,
  posts: postFacts,
  processors,
  security,
  isVerified,
  PLACEHOLDER_HOSTS,
} = manifest;

strict = launchState === "live";

console.log(
  `\n${bold("Launch readiness")}  ${dim(`— launchState: ${launchState}${strict ? " (strict)" : ""}`)}`
);

// ── Rule 1 — no placeholder media anywhere but the manifest ────────────────
//
// THE RULE THAT MATTERS MOST, and the one the old comment claimed.
//
// Note carefully why next.config.mjs was never sufficient: every placeholder
// image on this site was a plain <img>, not next/image. `remotePatterns` gated
// none of them. A source scan is the only thing that actually catches it.

section("Placeholder media");

const sourceFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full);
    } else if (/\.(ts|tsx|js|jsx|css|json|md)$/.test(entry)) {
      sourceFiles.push(full);
    }
  }
})(WEB_SRC);

const offenders = [];
for (const file of sourceFiles) {
  if (file === MANIFEST) continue; // the one quarantine
  const text = readFileSync(file, "utf8");
  for (const host of PLACEHOLDER_HOSTS) {
    if (!text.includes(host)) continue;
    const line = text.split(/\r?\n/).findIndex((l) => l.includes(host)) + 1;
    offenders.push(`${relative(ROOT, file).split(sep).join("/")}:${line} — ${host}`);
  }
}

if (offenders.length === 0) {
  pass(`no placeholder host outside the manifest (${sourceFiles.length} files scanned)`);
} else {
  fail(`${offenders.length} placeholder image reference(s) outside launch.ts`, [
    ...offenders,
    "",
    "Stock photography may only appear in apps/web/src/data/launch.ts, where it",
    "is recorded as unverified and therefore never rendered.",
  ]);
}

// ── Rule 2 — no fact claims to be verified while still the mockup ──────────
//
// The anti-fraud rule. Setting a date on a value nobody actually changed is the
// one way to defeat this whole system, so it is checked before anything else
// and it is fatal at every stage.

section("Verification integrity");

const allFacts = [
  ...Object.entries(contact).map(([k, f]) => [`contact.${k}`, f]),
  ...Object.entries(claims).map(([k, f]) => [`claims.${k}`, f]),
  ...testimonials.map((f, i) => [`testimonials[${i}] (${f.value.name})`, f]),
  ...Object.entries(media).map(([k, f]) => [`media.${k}`, f]),
  ...postFacts.map((f, i) => [`posts[${i}] (${f.value.slug})`, f]),
  ...processors.map((f, i) => [`processors[${i}] (${f.value.name})`, f]),
  ...Object.entries(security).map(([k, f]) => [`security.${k}`, f]),
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const frauds = allFacts.filter(
  ([, f]) => f.verified !== null && f.placeholder !== undefined && same(f.value, f.placeholder)
);

if (frauds.length === 0) {
  pass(`no fact is marked verified while still holding its mockup value (${allFacts.length} facts)`);
} else {
  fail(`${frauds.length} fact(s) marked verified but never actually changed`, [
    ...frauds.map(([name]) => name),
    "",
    "A verification date records that somebody checked the value against reality.",
    "If the value is still the one the mockup shipped, nobody did.",
  ]);
}

// A photograph cannot be verified as this business's own while hosted on a
// stock-photo CDN. Separate rule, same reasoning.
const mediaFacts = [
  ...Object.entries(media).map(([k, f]) => [`media.${k}`, f.value.src]),
  ...postFacts.map((f, i) => [`posts[${i}] (${f.value.slug})`, f.value.image.src]),
];
const fakeReal = mediaFacts.filter(([name, src], i) => {
  const fact = i < Object.keys(media).length
    ? Object.values(media)[i]
    : postFacts[i - Object.keys(media).length];
  return fact.verified !== null && PLACEHOLDER_HOSTS.some((h) => src.includes(h));
});

if (fakeReal.length === 0) {
  pass("no stock photograph is marked as this business's own");
} else {
  fail(`${fakeReal.length} verified photograph(s) still hosted on a stock CDN`, [
    ...fakeReal.map(([name, src]) => `${name} — ${src}`),
  ]);
}

// ── Rule 3 — shape, on the facts that claim to be real ─────────────────────
//
// Applied only to verified facts, because a placeholder is allowed to be
// nonsense. Catches a typo at the moment somebody fills a value in, which is
// exactly when typos happen and the worst time to discover one is later.

section("Shape of verified values");

const { normalisePhone } = await import(
  pathToFileURL(join(ROOT, "packages", "core", "src", "phone.ts")).href
);

const shapeChecks = [
  [
    "contact.phone",
    contact.phone,
    (v) => (normalisePhone(v) ? null : "not a number anyone could dial"),
  ],
  [
    "contact.whatsapp",
    contact.whatsapp,
    (v) =>
      !normalisePhone(v)
        ? "not a number anyone could dial"
        : /^\d+$/.test(v)
          ? null
          : "wa.me wants digits only — no +, no spaces, no brackets",
  ],
  [
    "contact.email",
    contact.email,
    (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "not an email address"),
  ],
  [
    "contact.domain",
    contact.domain,
    (v) =>
      /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v) ? null : "a bare hostname, no protocol and no path",
  ],
  [
    "contact.registrationNumber",
    contact.registrationNumber,
    (v) => (/^\d{4}\/\d{6}\/\d{2}$/.test(v) ? null : "CIPC numbers look like 2019/123456/07"),
  ],
  [
    "contact.informationOfficer",
    contact.informationOfficer,
    (v) =>
      v.trim().split(/\s+/).length >= 2
        ? null
        : "POPIA wants a named person, not a role or a department",
  ],
];

let shapeProblems = 0;
for (const [name, fact, check] of shapeChecks) {
  if (!isVerified(fact)) continue; // unverified is rule 4's business, not this one
  const problem = check(fact.value);
  if (problem) {
    shapeProblems++;
    fail(`${name} is verified but malformed`, [`"${fact.value}" — ${problem}`]);
  }
}
if (shapeProblems === 0) pass("every verified contact detail is well-formed");

// A verified post must have prose written for it, or the Journal silently
// drops it and nobody finds out until somebody asks where the post went.
const { draftSlugs } = await import(
  pathToFileURL(join(WEB_SRC, "data", "posts.ts")).href
);
const orphans = postFacts
  .filter((f) => isVerified(f) && !draftSlugs.includes(f.value.slug))
  .map((f) => f.value.slug);

if (orphans.length === 0) {
  pass("every verified post has prose to render");
} else {
  fail(`${orphans.length} verified post slug(s) have no draft in posts.ts`, orphans);
}

// ── Rule 4 — has anybody actually checked this? ────────────────────────────

section("Outstanding verification");

const unverified = allFacts.filter(([, f]) => !isVerified(f));

if (unverified.length === 0) {
  pass("every public claim on this site has been verified");
} else {
  const blocking = unverified.filter(([name]) => name.startsWith("contact."));
  const rest = unverified.filter(([name]) => !name.startsWith("contact."));

  if (blocking.length > 0) {
    // Always fatal in strict mode; and note these ALSO fail the production
    // build itself, via assertProductionReady() in launch.ts. Belt and braces,
    // because a contact detail is the one thing that reaches every page.
    requireVerified(
      `${blocking.length} contact detail(s) are still the mockup placeholder`,
      [
        ...blocking.map(([name, f]) => `${name} — ${f.evidence}`),
        "",
        "These block a production build outright, not only this check.",
      ]
    );
  }

  if (rest.length > 0) {
    requireVerified(`${rest.length} public claim(s) are withheld pending verification`, [
      ...rest.map(([name, f]) => `${name} — ${f.evidence}`),
      "",
      "The site renders correctly without these; they simply do not appear.",
    ]);
  }
}

// ── Rule 5 — the config actually behaves, asserted not assumed ─────────────
//
// Not a grep for the string "VERCEL_ENV". This imports the real config with
// the environment a production build would have, and asks it what it produced.

section("Production image configuration");

const restore = process.env.VERCEL_ENV;
process.env.VERCEL_ENV = "production";
try {
  const configPath = pathToFileURL(join(ROOT, "apps", "web", "next.config.mjs")).href;
  // Cache-busted, so this cannot pick up a copy imported under other settings.
  const loaded = await import(`${configPath}?production-assertion=${Date.now()}`);
  const hosts = (loaded.default?.images?.remotePatterns ?? []).map((p) => p.hostname);
  const leaked = hosts.filter((h) => PLACEHOLDER_HOSTS.includes(h));

  if (leaked.length === 0) {
    pass(`next.config.mjs allows no placeholder host in production (${hosts.length} allowed)`);
  } else {
    fail("next.config.mjs would allow placeholder images in production", leaked);
  }
} catch (error) {
  fail("could not load apps/web/next.config.mjs to assert its production behaviour", [
    String(error?.message ?? error),
  ]);
} finally {
  if (restore === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = restore;
}

// ── Rule 6 — no undocumented environment variable ──────────────────────────
//
// A variable read by the code but absent from .env.example is one nobody knows
// to set, which surfaces as a mystery 500 on a deployment nobody changed.

section("Environment documentation");

const PLATFORM_PROVIDED = new Set([
  "NODE_ENV",
  "CI",
  "VERCEL_ENV",
  "VERCEL_URL",
  "NEXT_RUNTIME",
  "NEXT_PUBLIC_VERCEL_ENV",
  "NEXT_TELEMETRY_DISABLED",
]);

const envExample = join(ROOT, ".env.example");
if (!existsSync(envExample)) {
  fail(".env.example is missing", ["Every environment variable must be documented there."]);
} else {
  const documented = new Set(
    readFileSync(envExample, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
      .filter(Boolean)
  );

  const scanRoots = [
    join(ROOT, "apps", "web", "src"),
    join(ROOT, "apps", "ops", "src"),
    join(ROOT, "packages"),
  ];

  const used = new Map();
  for (const root of scanRoots) {
    if (!existsSync(root)) continue;
    (function walk(dir) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === ".next") continue;
          walk(full);
        } else if (/\.(ts|tsx|mjs|js)$/.test(entry)) {
          const text = readFileSync(full, "utf8");
          for (const match of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
            if (!used.has(match[1])) used.set(match[1], relative(ROOT, full).split(sep).join("/"));
          }
        }
      }
    })(root);
  }

  const undocumented = [...used]
    .filter(([name]) => !PLATFORM_PROVIDED.has(name) && !documented.has(name))
    .map(([name, where]) => `${name} — first read in ${where}`);

  if (undocumented.length === 0) {
    pass(`every environment variable the code reads is documented (${used.size} found)`);
  } else {
    fail(`${undocumented.length} environment variable(s) missing from .env.example`, undocumented);
  }
}

// ── The database checks, when there are credentials for them ───────────────

if (withDb) {
  section("Published stock (live database)");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    warn("skipped — NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are not set", [
      "These checks need a live project. They are skipped rather than failed so",
      "the same command works in CI, where those secrets deliberately do not exist.",
    ]);
  } else {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(url, key, { auth: { persistSession: false } });

    const { data: rows, error } = await admin
      .from("item_media")
      .select("id, item_id, storage_path, external_url, is_placeholder, items!inner(slug, title, published_at, deleted_at)")
      .is("items.deleted_at", null)
      .not("items.published_at", "is", null);

    if (error) {
      fail("could not read item_media", [error.message]);
    } else {
      // 1. No placeholder media on anything the public can see.
      const placeheld = rows.filter((r) => r.is_placeholder);
      if (placeheld.length === 0) {
        pass(`no published item carries placeholder media (${rows.length} media rows checked)`);
      } else {
        fail(`${placeheld.length} placeholder image(s) on published items`, [
          ...placeheld.map((r) => `${r.items.slug} — ${r.external_url}`),
        ]);
      }

      // 2. Every published item has at least one REAL photograph. The publish
      //    trigger counts any photo, placeholders included, so without this an
      //    item can go live on a stock image and satisfy the database.
      const byItem = new Map();
      for (const row of rows) {
        const entry = byItem.get(row.item_id) ?? { slug: row.items.slug, real: 0 };
        if (row.storage_path && !row.is_placeholder) entry.real++;
        byItem.set(row.item_id, entry);
      }
      const photoless = [...byItem.values()].filter((i) => i.real === 0).map((i) => i.slug);
      if (photoless.length === 0) {
        pass(`every published item has a real photograph (${byItem.size} items)`);
      } else {
        fail(`${photoless.length} published item(s) have no real photograph`, photoless);
      }

      // 3. Every path actually resolves. Catches a row pointing at an object
      //    that was deleted from Storage — a broken image on a live page, which
      //    nothing else in this system would ever notice.
      const paths = rows.filter((r) => r.storage_path && !r.is_placeholder);
      const broken = [];
      await Promise.all(
        paths.map(async (row) => {
          const href = `${url}/storage/v1/object/public/item-media/${row.storage_path}`;
          try {
            const response = await fetch(href, {
              method: "HEAD",
              signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) broken.push(`${row.items.slug} — ${response.status} ${row.storage_path}`);
          } catch (e) {
            broken.push(`${row.items.slug} — ${e?.message ?? e} ${row.storage_path}`);
          }
        })
      );

      if (broken.length === 0) {
        pass(`every published photograph resolves (${paths.length} checked)`);
      } else {
        fail(`${broken.length} published photograph(s) do not load`, broken);
      }
    }
  }
}

// ── Tally ──────────────────────────────────────────────────────────────────

console.log("");
console.log(
  `${bold("  " + passed + " passed")}` +
    (warnings.length ? `, ${yellow(`${warnings.length} warning`)}` : "") +
    (failures.length ? `, ${red(`${failures.length} failed`)}` : "")
);

if (failures.length > 0) {
  console.log(`\n${red("  Not ready.")} Fix the failures above.\n`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.log(
    `\n${yellow("  Ready to deploy, not ready to launch.")}\n` +
      `  ${dim("The warnings above are things no visitor will see until they are verified.")}\n` +
      `  ${dim('Fill them in at apps/web/src/data/launch.ts, then set launchState to "live"')}\n` +
      `  ${dim("to make them blocking so they cannot regress.")}\n`
  );
  process.exit(0);
}

console.log(`\n${green("  Ready.")} Every public claim on this site has been verified.\n`);
