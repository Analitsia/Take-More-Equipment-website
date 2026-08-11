/**
 * The nightly cron endpoint's front door.
 *
 *   npm run test:match                                       # localhost:3001
 *   OPS_URL=https://takemore-ops.vercel.app npm run test:match
 *
 * WHY THIS EXISTS
 * ---------------
 * /api/match is the only route in either app that a stranger on the internet
 * can reach and that does real work when it succeeds. Its entire protection is
 * a string comparison, and until now nothing checked that the comparison was
 * wired up the way the comments say it is.
 *
 * `tsc` cannot see any of this. An `if` inverted while refactoring, an env var
 * renamed on one side, a `return` moved above the auth check — every one of
 * those compiles, builds and deploys, and the first symptom is somebody else
 * running the job. So the auth matrix is asserted over real HTTP against a
 * running server.
 *
 * It also asserts the ledger, because a cron whose observability is broken is
 * a cron nobody will notice has stopped: an authorised run must leave a
 * cron_runs row behind, or /api/health and the dashboard strip are both lying.
 *
 * ── The assertion this file used to be missing ────────────────────────────
 *
 * This header used to say the CRON_SECRET path was deliberately not asserted,
 * "because Vercel sets that variable itself". Vercel does not. Nothing did, and
 * so for the first three nights of its life the job fired on schedule, arrived
 * with no Authorization header, and was refused — while this suite reported
 * green, because "no credential at all is refused" is a PASS and is also
 * exactly the request the scheduler was making.
 *
 * A test that covers every way in except the one the caller actually uses is
 * worse than no test, because it is believed. So the scheduler's own request
 * shape is asserted below whenever CRON_SECRET is in the environment, and the
 * skip that stands in for it when it is not says plainly what has not been
 * checked.
 */

import { createClient } from "@supabase/supabase-js";

const base = (process.env.OPS_URL ?? "http://localhost:3001").replace(/\/$/, "");
const secret = process.env.REVALIDATE_SECRET;
// The one Vercel puts in the Bearer header. Absent locally unless somebody
// pulls it down on purpose, which is why its absence is a loud skip and not a
// silent one — see the header.
const cronSecret = process.env.CRON_SECRET;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;

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

const hit = async (path, init) => {
  const response = await fetch(`${base}${path}`, { redirect: "manual", ...init });
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* a 500 from Next is HTML, and that is itself informative */
  }
  return { status: response.status, body };
};

console.log(`\n\x1b[1mThe cron endpoint\x1b[0m  \x1b[2m— ${base}\x1b[0m`);

// Fail fast and loudly rather than reporting green against nothing.
try {
  const probe = await fetch(`${base}/api/match`, { method: "GET", redirect: "manual" });
  if (probe.status === 0) throw new Error("no response");
} catch (error) {
  console.error(
    `\n  Could not reach ${base}. Start the ops app first:\n` +
      `    npm run dev --workspace=@takemore/ops\n\n  ${error?.message ?? error}\n`
  );
  process.exit(1);
}

// ── The refusals ───────────────────────────────────────────────────────────
// Every one of these must be refused BEFORE any work happens. A 401 that ran
// the job first is not a 401.

section("Who is turned away");

{
  const { status, body } = await hit("/api/match");
  if (status === 401) ok("no credential at all is refused", "401");
  else if (status === 503 && body?.error === "not configured")
    ok("refuses when no secret is configured at either end", "503");
  else fail("no credential at all is refused", `got ${status} ${JSON.stringify(body)}`);
}

{
  const { status } = await hit("/api/match", { headers: { "x-revalidate-secret": "wrong" } });
  if (status === 401 || status === 503) ok("a wrong secret is refused", String(status));
  else fail("a wrong secret is refused", `got ${status}`);
}

{
  const { status } = await hit("/api/match?secret=wrong");
  if (status === 401 || status === 503) ok("a wrong secret in the query string is refused", String(status));
  else fail("a wrong secret in the query string is refused", `got ${status}`);
}

{
  // The near-miss. A comparison written with startsWith, or one that trims,
  // would let this through — and it is the shape of mistake that looks correct.
  const { status } = await hit("/api/match", {
    headers: { "x-revalidate-secret": `${secret ?? "x"}extra` },
  });
  if (status === 401 || status === 503) ok("a secret with extra characters appended is refused", String(status));
  else fail("a secret with extra characters appended is refused", `got ${status}`);
}

{
  const { status } = await hit("/api/match", { headers: { authorization: "Bearer wrong" } });
  if (status === 401 || status === 503) ok("a wrong bearer token is refused", String(status));
  else fail("a wrong bearer token is refused", `got ${status}`);
}

// ── The caller that actually matters ───────────────────────────────────────
// Everything above is a stranger being turned away. This is the scheduler being
// let in, which is the only one of the two that has ever been broken.

section("Vercel's scheduler");

{
  // The exact request Vercel makes when CRON_SECRET is NOT set: its user-agent,
  // and no credential. It must be refused — but a refusal here is the failure
  // mode that went unnoticed for three days, so the route reports it to Sentry
  // and this assertion exists to say out loud that a 401 is what production
  // gets when the variable is missing.
  const { status } = await hit("/api/match", {
    headers: { "user-agent": "vercel-cron/1.0" },
  });
  if (status === 401 || status === 503) {
    ok("an unconfigured scheduler request is refused", `${status} — and reported`);
  } else {
    fail("an unconfigured scheduler request is refused", `got ${status}`);
  }
}

if (!cronSecret) {
  console.log(
    "  \x1b[33mSKIP\x1b[0m  CRON_SECRET is not in this environment, so the path Vercel\n" +
      "        actually uses at 04:00 has NOT been checked. Set it and re-run\n" +
      "        against the deployment before believing this cron works."
  );
} else {
  const { status, body } = await hit("/api/match", {
    method: "POST",
    headers: {
      authorization: `Bearer ${cronSecret}`,
      "user-agent": "vercel-cron/1.0",
    },
  });
  if (status === 200 && typeof body?.queued === "number") {
    ok("the scheduler's own request is accepted", `queued ${body.queued}`);
  } else {
    fail("the scheduler's own request is accepted", `got ${status} ${JSON.stringify(body)}`);
  }
}

// ── The real thing ─────────────────────────────────────────────────────────

section("The authorised run");

if (!secret) {
  console.log(
    "  \x1b[33mSKIP\x1b[0m  REVALIDATE_SECRET is not set, so the success path cannot be exercised.\n" +
      "        The refusals above still ran, and they are the half that matters most."
  );
} else {
  const before = new Date().toISOString();

  const { status, body } = await hit("/api/match", {
    headers: { "x-revalidate-secret": secret },
  });

  if (status === 200 && typeof body?.queued === "number") {
    ok("the right secret runs the sweep", `queued ${body.queued}`);
  } else {
    fail("the right secret runs the sweep", `got ${status} ${JSON.stringify(body)}`);
  }

  // POST as well as GET — Vercel's scheduler has used both over the years, and
  // a route that only answers one of them fails silently at 04:00.
  const posted = await hit("/api/match", {
    method: "POST",
    headers: { "x-revalidate-secret": secret },
  });
  if (posted.status === 200) ok("POST works as well as GET");
  else fail("POST works as well as GET", `got ${posted.status}`);

  // No Postgres internals in the response. This endpoint is reachable by
  // anyone who can guess a secret, and a raw error message names tables.
  if (body?.error === undefined || !/relation|column|function|permission/i.test(String(body.error))) {
    ok("no database detail is echoed to the caller");
  } else {
    fail("no database detail is echoed to the caller", String(body.error));
  }

  // ── The ledger ───────────────────────────────────────────────────────────
  // A cron whose observability is broken is a cron nobody notices has stopped.
  if (!url || !serviceKey) {
    console.log("  \x1b[33mSKIP\x1b[0m  no Supabase credentials, so cron_runs cannot be checked.");
  } else {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from("cron_runs")
      .select("started_at, finished_at, ok, result")
      .eq("job", "stock_match")
      .gte("started_at", before)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      fail("the run is recorded in cron_runs", error.message);
    } else if (!data) {
      fail("the run is recorded in cron_runs", "no row was written for this run");
    } else if (data.ok !== true) {
      fail("the run is recorded as successful", `ok = ${data.ok}`);
    } else if (!data.finished_at) {
      fail("the run is recorded as finished", "finished_at is null");
    } else {
      ok("the run is recorded in cron_runs", `queued ${data.result?.queued ?? "?"}`);
    }
  }

  // ── /api/health agrees ───────────────────────────────────────────────────
  const health = await hit("/api/health");
  if (health.status === 200 && health.body?.ok === true) {
    ok("/api/health reports healthy after a successful run");
  } else {
    fail(
      "/api/health reports healthy after a successful run",
      `got ${health.status} ${JSON.stringify(health.body)}`
    );
  }

  if (health.body && "turnstileConfigured" in health.body) {
    ok(
      "/api/health reports whether Turnstile is configured",
      health.body.turnstileConfigured ? "configured" : "not configured"
    );
  } else {
    fail("/api/health reports whether Turnstile is configured", "field is absent");
  }
}

console.log(
  `\n  \x1b[1m${passed} passed\x1b[0m${failures.length ? `, \x1b[31m${failures.length} failed\x1b[0m` : ""}\n`
);
process.exit(failures.length > 0 ? 1 : 0);
