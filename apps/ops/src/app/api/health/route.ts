import { NextResponse } from "next/server";
import { createAdminClient } from "@takemore/db/admin";
import { reportError } from "@takemore/observability";

/**
 * Is this thing working?
 *
 * Unauthenticated on purpose, so a free external pinger (UptimeRobot, Better
 * Stack, a cron on any machine) can watch it without holding a credential.
 * That external check is the point: cron_runs cannot notice a job that never
 * fired, and Sentry cannot notice this app being down. A request from outside
 * that expects a 200 catches both.
 *
 * BECAUSE IT IS PUBLIC, it says as little as it can get away with. No error
 * text, no counts, no table names, no version — those tell somebody probing
 * the ops subdomain more than they tell Carlo. A status, a timestamp and a
 * reason phrase are enough to alert on, and nothing here is worth knowing to
 * an attacker.
 *
 * Alert on a non-200. That is the whole contract.
 */

export const dynamic = "force-dynamic";

/**
 * The sweep runs daily at 04:00. Twenty-six hours, not twenty-four: a daily
 * schedule with a 24-hour staleness threshold flaps on ordinary scheduler
 * jitter and on the days a clock changes, and an alert that cries wolf monthly
 * is one somebody mutes — at which point it is worse than no alert, because it
 * looks like coverage.
 */
const STALE_AFTER_HOURS = 26;

export async function GET() {
  const turnstileConfigured = Boolean(
    process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );

  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("cron_runs")
      .select("started_at, finished_at, ok")
      .eq("job", "stock_match")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      reportError(error, { where: "api/health" });
      return NextResponse.json({ ok: false, reason: "database unreachable" }, { status: 503 });
    }

    if (!data) {
      // Never run. True on a fresh deployment before 04:00 comes around, so it
      // is a 503 with an honest reason rather than a failure — the alert fires,
      // somebody looks, and the reason explains itself.
      return NextResponse.json(
        { ok: false, reason: "the nightly sweep has never run", turnstileConfigured },
        { status: 503 }
      );
    }

    const startedAt = new Date(data.started_at);
    const ageHours = (Date.now() - startedAt.getTime()) / 3_600_000;

    // ok === null means it opened a ledger row and never closed one: killed
    // mid-run, or a serverless timeout. Distinct from a failure and worth
    // saying so, because the two have different causes.
    const state =
      data.ok === true ? "ok" : data.ok === false ? "failed" : "did not finish";

    if (data.ok !== true) {
      return NextResponse.json(
        { ok: false, reason: `the nightly sweep ${state}`, lastRunAt: data.started_at, turnstileConfigured },
        { status: 503 }
      );
    }

    if (ageHours > STALE_AFTER_HOURS) {
      return NextResponse.json(
        {
          ok: false,
          reason: `the nightly sweep last ran ${Math.floor(ageHours)} hours ago`,
          lastRunAt: data.started_at,
          turnstileConfigured,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      lastRunAt: data.started_at,
      ageHours: Math.round(ageHours * 10) / 10,
      // Surfaced because an unconfigured Turnstile takes both public forms
      // offline in production, by design — so it must be visible from outside
      // rather than only in a log somebody would have to think to read.
      turnstileConfigured,
    });
  } catch (thrown) {
    reportError(thrown, { where: "api/health" });
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
}
