/**
 * Nothing that looks like a credential goes into git.
 *
 *   npm run check:secrets            # every tracked file
 *   node scripts/check-no-secrets.mjs --staged
 *
 * The pre-commit hook runs the --staged form, so a key is caught before it
 * exists in history rather than after — which matters, because the fix for a
 * committed secret is rotating it, not deleting the commit.
 *
 * `.gitignore` already covers `.env*.local` and FIRST-LOGIN.local.md. This is
 * for the ways a key gets committed anyway: pasted into a script while
 * debugging, hardcoded "just for a minute" in a test, or added to a new file in
 * a directory nobody thought to ignore.
 *
 * Deliberately narrow. It matches the shapes this project's own providers
 * issue, so a false positive is rare enough that nobody learns to pass
 * `--no-verify`. A generic high-entropy-string detector would be the opposite.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const stagedOnly = process.argv.includes("--staged");

const PATTERNS = [
  {
    name: "Supabase secret key",
    // sb_secret_ followed by the key body. The publishable key is safe by
    // design and ships to browsers, so it is deliberately not matched.
    re: /\bsb_secret_[A-Za-z0-9_-]{8,}/,
    fix: "Rotate it in the Supabase dashboard, then put the new one in .env.local.",
  },
  {
    name: "Supabase personal access token",
    re: /\bsbp_[a-f0-9]{40,}/,
    fix: "Rotate it at supabase.com/dashboard/account/tokens.",
  },
  {
    name: "Resend API key",
    re: /\bre_[A-Za-z0-9_-]{16,}/,
    fix: "Rotate it in the Resend dashboard.",
  },
  {
    name: "Vercel token",
    re: /\bvercel_[A-Za-z0-9]{24,}/,
    fix: "Rotate it at vercel.com/account/tokens.",
  },
  {
    name: "Sentry auth token",
    re: /\bsntrys_[A-Za-z0-9_.-]{20,}/,
    fix: "Rotate it in Sentry under Settings → Auth Tokens.",
  },
  {
    name: "a filled-in secret assignment",
    // SOMETHING_SECRET=notempty, but not SOMETHING_SECRET= on its own, which is
    // what .env.example is made of. The value is captured so `looksLikeAnExample`
    // below can wave through documentation.
    re: /^[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PEPPER)[A-Z0-9_]*\s*=\s*['"]?([^\s'"#]{8,})/m,
    fix: "Values belong in .env.local, which is gitignored. .env.example carries names only.",
  },
];

/**
 * Is this a documented shape rather than a real credential?
 *
 * The README shows `SUPABASE_SECRET_KEY=sb_secret_…` to teach the format, and
 * flagging that would be a false positive on a file that is doing its job.
 * Rather than allowlisting the whole file — which would then hide a real key
 * pasted into it later — recognise the placeholder conventions themselves.
 *
 * All of these are things a working credential cannot contain.
 */
const looksLikeAnExample = (value) =>
  /[…<>$]/.test(value) ||
  value.includes("...") ||
  /^(your|my|the)[-_]/i.test(value) ||
  /(example|placeholder|changeme|xxxx|not_a_real|notarealkey)/i.test(value);

/** Files whose whole purpose is to describe these shapes. */
const ALLOWED = new Set([
  "scripts/check-no-secrets.mjs",
  ".env.example",
  "docs/runbook.md",
  "docs/launch-checklist.md",
]);

const listFiles = () => {
  const command = stagedOnly
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACM"]
    : ["ls-files"];
  return execFileSync("git", command, { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const red = (t) => (colour ? `\x1b[31m${t}\x1b[0m` : t);
const green = (t) => (colour ? `\x1b[32m${t}\x1b[0m` : t);
const dim = (t) => (colour ? `\x1b[2m${t}\x1b[0m` : t);

const findings = [];
let scanned = 0;

for (const file of listFiles()) {
  if (ALLOWED.has(file)) continue;

  let text;
  try {
    // Skip anything large or binary — a key is not hiding in a PNG, and
    // reading one in wastes the budget this hook is supposed to stay inside.
    if (statSync(file).size > 512_000) continue;
    text = readFileSync(file, "utf8");
    if (text.includes("\0")) continue; // a null byte means it is not text
  } catch {
    continue; // deleted between listing and reading, or unreadable
  }

  scanned++;
  for (const { name, re, fix } of PATTERNS) {
    const match = text.match(re);
    if (!match) continue;
    // Applied to every pattern, not only the generic assignment one: CI needs a
    // value shaped like a real key so the build's env-var check is satisfied,
    // and `sb_secret_ci_not_a_real_key` is exactly the shape this would
    // otherwise flag. match[1] is the captured value where there is one.
    if (looksLikeAnExample(match[1] ?? match[0])) continue;
    const line = text.slice(0, match.index).split("\n").length;
    findings.push({ file, line, name, fix, sample: match[0].slice(0, 12) });
  }
}

if (findings.length === 0) {
  console.log(green(`  no credentials found (${scanned} files scanned)`));
  process.exit(0);
}

console.log(red(`\n  ${findings.length} possible credential(s) in ${stagedOnly ? "staged changes" : "tracked files"}:\n`));
for (const f of findings) {
  console.log(`  ${red("✗")} ${f.file}:${f.line} — ${f.name} (${f.sample}…)`);
  console.log(`    ${dim(f.fix)}`);
}
console.log(
  dim(
    "\n  If this is a false positive, add the path to ALLOWED in\n" +
      "  scripts/check-no-secrets.mjs and say in the commit why it is safe.\n"
  )
);
process.exit(1);
