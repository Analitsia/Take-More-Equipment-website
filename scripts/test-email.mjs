/**
 * The marketing email, rendered but never sent.
 *
 *   npm run test:email
 *
 * WHY THIS EXISTS
 * ---------------
 * The email path was the largest completely untested surface in the system, and
 * the one where a mistake is least recoverable: a newsletter goes to everybody
 * at once and cannot be recalled. Two specific things needed asserting.
 *
 * FIRST, the compliance headers. RFC 8058 one-click unsubscribe has been
 * required by Gmail and Yahoo for bulk senders since February 2024 — without
 * both List-Unsubscribe headers the mail lands in spam no matter how good the
 * match was — and POPIA s69 separately requires an opt-out in EVERY message,
 * which is why there is a visible footer link as well. All three are one typo
 * away from being absent, and nothing would surface that until deliverability
 * quietly collapsed weeks later.
 *
 * SECOND, per-recipient tokens. Every message must carry ITS OWN unsubscribe
 * token. A shared one means the first person to opt out unsubscribes somebody
 * else — a POPIA breach that would present as "we did unsubscribe them" while
 * the wrong row was updated.
 *
 * NEEDS NO CREDENTIALS AND SENDS NOTHING. Everything here is pure rendering, so
 * it runs in CI, offline, and in a clean checkout. That is the point: the one
 * test that has to be cheap to run is the one guarding the irreversible action.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "apps", "ops", "src", "lib", "email.ts"), "utf8");

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
const section = (n) => console.log(`\n\x1b[1m${n}\x1b[0m`);

console.log("\n\x1b[1mThe marketing email\x1b[0m");

/**
 * Asserted against the SOURCE, not by importing it.
 *
 * apps/ops/src/lib/email.ts opens with `import "server-only"`, which throws
 * outside a React Server Component, and it constructs a Resend client from an
 * API key. Importing it here would either fail or put a real transport one
 * function call away from a test — and a test that can accidentally send a
 * newsletter to every customer is not a test worth having.
 *
 * The trade-off is honest: this checks that the right strings are in the right
 * places, not that the runtime behaves. It catches the deletions and typos that
 * are the realistic failure mode for compliance headers, which is what it is
 * for. The rendering itself is exercised by a human through the campaign
 * preview, which uses the same wrap().
 */

section("Compliance headers");

const checks = [
  [
    "List-Unsubscribe header is set",
    /"List-Unsubscribe":\s*`?<?\$\{url\}/,
    "Gmail and Yahoo require this for bulk senders (RFC 8058).",
  ],
  [
    "List-Unsubscribe-Post enables one-click",
    /"List-Unsubscribe-Post":\s*"List-Unsubscribe=One-Click"/,
    "Without it the header is advisory and the sender is still treated as non-compliant.",
  ],
  [
    "a visible unsubscribe link is in the HTML footer",
    /unsubscribeUrl\(token\)[\s\S]{0,200}Unsubscribe in one click/,
    "POPIA s69 requires an opt-out in the message itself, not only in a header.",
  ],
  [
    "the plain-text part carries the opt-out too",
    /text:\s*`\$\{[a-zA-Z.]+\}\\n\\n---\\nStop these: \$\{url\}`/,
    "Many recipients see only the text part.",
  ],
];

for (const [name, pattern, why] of checks) {
  if (pattern.test(source)) ok(name);
  else fail(name, why);
}

section("Per-recipient tokens");

// The batch builds each message inside a map over recipients, taking the token
// from that recipient. A refactor that hoisted the token out of the loop would
// be the bug this catches.
if (/chunk\.map\(\(recipient\)\s*=>\s*\{[\s\S]{0,400}unsubscribeUrl\(recipient\.unsubscribeToken\)/.test(source)) {
  ok("each message in a batch uses its own recipient's token");
} else {
  fail(
    "each message in a batch uses its own recipient's token",
    "A shared token means one person's opt-out unsubscribes somebody else."
  );
}

if (/html:\s*wrap\(recipient\.body,\s*recipient\.unsubscribeToken/.test(source)) {
  ok("the HTML body is wrapped with that same recipient's token");
} else {
  fail("the HTML body is wrapped with that same recipient's token", "wrap() must receive the per-recipient token.");
}

section("Preview and send cannot drift apart");

// The whole value of a preview is that it is the same renderer. A preview that
// re-implements the template reassures somebody about an email that no longer
// looks like that.
if (/export function renderPreview\([\s\S]{0,200}return wrap\(/.test(source)) {
  ok("the preview calls wrap(), rather than re-implementing it");
} else {
  fail(
    "the preview calls wrap(), rather than re-implementing it",
    "A preview built from a copy of the template will drift from what actually sends."
  );
}

if (/PREVIEW_TOKEN\s*=\s*"preview-token-not-a-real-unsubscribe"/.test(source)) {
  ok("the preview's unsubscribe token is visibly a placeholder");
} else {
  fail(
    "the preview's unsubscribe token is visibly a placeholder",
    "A preview must not contain a working unsubscribe link for a real person."
  );
}

section("Sending is off by default");

if (/const KEY = process\.env\.RESEND_API_KEY/.test(source) && /if \(!KEY\) return null/.test(source)) {
  ok("no API key means no transport is constructed");
} else {
  fail("no API key means no transport is constructed", "Sending must be impossible until it is configured.");
}

if (/BUSINESS_POSTAL_IDENTITY/.test(source)) {
  ok("the postal identity in the footer is configurable, not hardcoded");
} else {
  fail(
    "the postal identity in the footer is configurable, not hardcoded",
    "It has to change when the real registered address is filled in."
  );
}

section("Escaping");

if (/const escape = \(text: string\)[\s\S]{0,300}replace\(\/&\/g, "&amp;"\)/.test(source)) {
  ok("HTML entities are escaped before interpolation");
} else {
  fail("HTML entities are escaped before interpolation", "Campaign copy is user input.");
}

// The one place escaping is deliberately partial: linkify() escapes first and
// then re-introduces anchor tags for bare URLs. Assert that ordering, because
// doing it the other way round would make the escaping pointless.
if (/const linkify = \(text: string\) =>\s*\n?\s*escape\(text\)\.replace\(/.test(source)) {
  ok("linkify escapes before it inserts anchors, not after");
} else {
  fail(
    "linkify escapes before it inserts anchors, not after",
    "Escaping after inserting markup would strip the markup and leave the injection."
  );
}

console.log(
  `\n  \x1b[1m${passed} passed\x1b[0m${failures.length ? `, \x1b[31m${failures.length} failed\x1b[0m` : ""}\n`
);
process.exit(failures.length > 0 ? 1 : 0);
