/**
 * Create and configure the two Vercel projects.
 *
 *   node --env-file=.env.local scripts/setup-vercel.mjs
 *
 * Idempotent: run it again after changing a secret and it updates in place.
 *
 * Two projects, one repository, different root directories — that is what gives
 * independent deploys without splitting the repo. Vercel skips building a
 * project whose files did not change, so editing the storefront does not
 * redeploy the ops app, and vice versa; a change to packages/* redeploys both,
 * which is correct, because both depend on it.
 */

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const TEAM = "team_WfWqkiATGzlB83KCmMCuYe9P";
const REPO = "Analitsia/Take-More-Equipment-website";
const WEB = "take-more-equipment-website";
const OPS = "takemore-ops";

const token = JSON.parse(
  readFileSync("C:/Users/carlo/AppData/Roaming/xdg.data/com.vercel.cli/auth.json", "utf8")
).token;

const api = async (path, init = {}) => {
  const url = `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = body;
  }
  return { ok: res.ok, status: res.status, body: parsed };
};

// --- the ops project --------------------------------------------------------
let ops = await api(`/v9/projects/${OPS}`);
if (!ops.ok) {
  console.log(`Creating ${OPS}…`);
  const created = await api("/v10/projects", {
    method: "POST",
    body: JSON.stringify({
      name: OPS,
      framework: "nextjs",
      rootDirectory: "apps/ops",
      gitRepository: { type: "github", repo: REPO },
    }),
  });
  if (!created.ok) {
    console.error("Could not create the project:", created.status, created.body?.error ?? created.body);
    process.exit(1);
  }
  ops = { ok: true, body: created.body };
} else {
  console.log(`${OPS} already exists.`);
}

// Without this the build cannot resolve @takemore/* — packages/ live outside
// the root directory, and the failure reads as a module-not-found rather than
// as a missing setting.
await api(`/v9/projects/${OPS}`, {
  method: "PATCH",
  body: JSON.stringify({ sourceFilesOutsideRootDirectory: true, rootDirectory: "apps/ops" }),
});

// --- shared secret between the two apps ------------------------------------
// Reused if one is already set, so re-running does not break a live pairing.
const existing = await api(`/v9/projects/${WEB}/env?decrypt=true`);
const current = (existing.body?.envs ?? []).find((e) => e.key === "REVALIDATE_SECRET");
const revalidateSecret = current?.value ?? randomBytes(24).toString("base64url");

const setEnv = async (project, key, value, { secret = false } = {}) => {
  // Remove first: the upsert endpoint refuses a duplicate key/target pair.
  const list = await api(`/v9/projects/${project}/env`);
  for (const env of list.body?.envs ?? []) {
    if (env.key === key) await api(`/v9/projects/${project}/env/${env.id}`, { method: "DELETE" });
  }
  const res = await api(`/v10/projects/${project}/env`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value,
      type: secret ? "encrypted" : "plain",
      target: ["production", "preview", "development"],
    }),
  });
  console.log(`  ${res.ok ? "set" : "FAILED"}  ${project} / ${key}`);
  if (!res.ok) console.error("   ", res.body?.error ?? res.body);
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishable || !secretKey) {
  console.error("Missing Supabase env — run with --env-file=.env.local");
  process.exit(1);
}

const storefront = `https://${WEB}.vercel.app`;
const opsUrl = `https://${OPS}.vercel.app`;

console.log("\nStorefront env:");
await setEnv(WEB, "NEXT_PUBLIC_SUPABASE_URL", url);
await setEnv(WEB, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishable);
await setEnv(WEB, "REVALIDATE_SECRET", revalidateSecret, { secret: true });
await setEnv(WEB, "NEXT_PUBLIC_SITE_URL", storefront);

console.log("\nOps env:");
await setEnv(OPS, "NEXT_PUBLIC_SUPABASE_URL", url);
await setEnv(OPS, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishable);
// The only place this key exists outside a local .env.local. Encrypted, server
// side, and never referenced by a NEXT_PUBLIC_ name.
await setEnv(OPS, "SUPABASE_SECRET_KEY", secretKey, { secret: true });
await setEnv(OPS, "REVALIDATE_SECRET", revalidateSecret, { secret: true });
await setEnv(OPS, "STOREFRONT_URL", storefront);
await setEnv(OPS, "NEXT_PUBLIC_STOREFRONT_URL", storefront);

console.log(`\nStorefront: ${storefront}`);
console.log(`Ops:        ${opsUrl}`);
console.log("\nREVALIDATE_SECRET is shared between the two and stays server-side on both.");
