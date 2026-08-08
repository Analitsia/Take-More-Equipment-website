import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@takemore/db/admin";
import { cronFinish, cronStart, reportError } from "@takemore/observability";

/**
 * The nightly sweep.
 *
 * Every live machine is re-matched against every recorded want. Not because the
 * publish path is unreliable, but because the things it cannot see happen all
 * the time: a category filled in an hour after the item went up, a customer
 * captured five minutes after the machine was listed, a deploy that landed
 * mid-publish.
 *
 * Same shape as the storefront's 300-second cache expiry sitting behind the
 * revalidate webhook — one eager path, one patient one, and the patient one is
 * what makes the eager one allowed to fail quietly.
 *
 * Idempotent by construction: the outreach_once index absorbs every repeat, so
 * running this hourly, nightly or twice by accident produces the same queue.
 *
 * Wire it up in Vercel with a cron on this path. Vercel signs its own cron
 * requests with CRON_SECRET; the REVALIDATE_SECRET header is accepted too so
 * the loop can be exercised by hand from a terminal.
 *
 * ── Being able to tell when this stops working ────────────────────────────
 *
 * This used to fail into a void. On error it wrote one console.error and
 * returned a 500 — to a caller that is Vercel's scheduler, which reads 500s to
 * nobody. The job could have failed every night for a month, and the first
 * symptom would have been a customer asking why nobody told them the machine
 * they wanted had come in.
 *
 * Three things now watch it, because no one of them is sufficient:
 *
 *   cron_runs      what the sweep DID. Queryable next to the data it produced,
 *                  shown on the ops dashboard. Cannot see a run that never
 *                  happened — no row looks exactly like an empty table.
 *   Sentry check-in  whether it ran AT ALL. The only one that alerts on
 *                  absence. Silently inert when Sentry is not configured.
 *   /api/health    read by an external pinger, and the only one that survives
 *                  this whole app being down.
 */

export const dynamic = "force-dynamic";

const MONITOR = "stock-match";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorised(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const header = request.headers.get("authorization") ?? "";
    if (safeEqual(header, `Bearer ${cronSecret}`)) return true;
  }

  const shared = process.env.REVALIDATE_SECRET;
  if (shared) {
    // Header first. The query-string form is still accepted because it is what
    // makes a manual run possible from a phone or a plain curl, but it lands in
    // access logs — so it is the fallback, never the documented way.
    const provided =
      request.headers.get("x-revalidate-secret") ??
      request.nextUrl.searchParams.get("secret") ??
      "";
    if (safeEqual(provided, shared)) return true;
  }

  return false;
}

async function run(request: NextRequest) {
  if (!process.env.CRON_SECRET && !process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  // Everything below is wrapped. createAdminClient() itself throws when
  // SUPABASE_SECRET_KEY is missing, and before this that produced a bare Next
  // 500 with nothing in any log — the single hardest version of this failure to
  // diagnose, because it looks identical to the route not existing.
  try {
    // The admin client, because a cron has no signed-in user. run_stock_match()
    // is SECURITY DEFINER and refuses any caller that HAS a uid but is not
    // staff, so this path is reachable only by something holding the secret key
    // — which never leaves the server.
    const admin = createAdminClient();

    // Open the ledger BEFORE doing the work, so a run that dies mid-flight
    // leaves a row with a null finished_at rather than no trace at all.
    // `?? null` throughout: a ledger that cannot be written must never stop the
    // job it is describing.
    const started = await admin
      .from("cron_runs")
      .insert({ job: "stock_match" })
      .select("id")
      .single();

    const runId = started.data?.id ?? null;
    if (started.error) {
      reportError(started.error, { where: "api/match", stage: "open-ledger" });
    }

    const checkIn = cronStart(MONITOR);

    const { data, error } = await admin.rpc("run_stock_match");

    if (error) {
      if (runId !== null) {
        await admin
          .from("cron_runs")
          .update({ finished_at: new Date().toISOString(), ok: false, error: error.message })
          .eq("id", runId);
      }
      cronFinish(MONITOR, checkIn, "error");
      reportError(error, { where: "api/match", stage: "run_stock_match" });

      // Deliberately NOT the Postgres message. It happily names tables and
      // columns, and this endpoint is reachable by anyone who can guess a
      // secret. The detail goes to Sentry and to cron_runs, both of which
      // require an account to read.
      return NextResponse.json({ error: "match failed" }, { status: 500 });
    }

    const queued = data ?? 0;

    if (runId !== null) {
      const closed = await admin
        .from("cron_runs")
        .update({ finished_at: new Date().toISOString(), ok: true, result: { queued } })
        .eq("id", runId);
      if (closed.error) {
        reportError(closed.error, { where: "api/match", stage: "close-ledger" });
      }
    }

    cronFinish(MONITOR, checkIn, "ok");

    return NextResponse.json({ queued, at: new Date().toISOString() });
  } catch (thrown) {
    reportError(thrown, { where: "api/match", stage: "unhandled" });
    return NextResponse.json({ error: "match failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
