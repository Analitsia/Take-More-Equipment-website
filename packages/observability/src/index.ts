/**
 * Somewhere to send the things that went wrong.
 *
 * Before this existed, every failure path in both apps was a `console.error`
 * and several were not even that — `const { data } = await client.from(...)`
 * discards the error, so a broken query rendered as an empty page with nothing
 * anywhere to say why. On Vercel that is invisible, and the nightly stock-match
 * cron could have failed every night for a month without anyone noticing.
 *
 * THREE RULES, all of which exist because the alternative bit somebody:
 *
 *   1. This NEVER THROWS. The whole body is wrapped. A reporter that can fail a
 *      request is strictly worse than no reporter, and "the error handler threw"
 *      is the least debuggable failure there is.
 *
 *   2. This RETURNS VOID. Call sites stay one line and the `{ ok, error }`
 *      contract every server action returns is untouched. Do not "helpfully"
 *      refactor it to return a result — the call sites are error paths that
 *      already know what they are returning.
 *
 *   3. console.error ALWAYS runs, Sentry or no Sentry. Vercel's runtime logs are
 *      the zero-configuration floor, and they work on day one with nothing set
 *      up. Sentry is the addition, not the replacement.
 *
 * There is deliberately no `if (dsn)` check here. `Sentry.captureException` is
 * already a no-op when the SDK was never initialised, and the DSN is checked in
 * exactly one place — `enabled: Boolean(dsn)` in each app's sentry.*.config.ts.
 * One conditional, in the file whose job is configuration.
 */

import * as Sentry from "@sentry/nextjs";
/**
 * captureCheckIn comes from @sentry/core, not from @sentry/nextjs.
 *
 * It used to be imported off the Sentry namespace above, and in SDK v10 that
 * export does not exist — so `Sentry.captureCheckIn(...)` threw a TypeError on
 * every call, cronStart()'s catch swallowed it and returned null, and cronFinish
 * returned early on the null. The cron monitor described below as "the only
 * mechanism that alerts on ABSENCE" had therefore never sent a single check-in.
 *
 * The build said so the whole time — `Attempted import error: 'captureCheckIn'
 * is not exported from '@sentry/nextjs'` — as a warning, in a build that
 * succeeded. That is the entire failure: a monitor that reports nothing looks
 * exactly like a system with nothing to report.
 *
 * @sentry/nextjs depends on @sentry/core, so this is the same instance and the
 * same client; it is named as a direct dependency so the resolution is not
 * hoisting luck.
 */
import { captureCheckIn } from "@sentry/core";

export type ErrorContext = {
  /** Where this happened, in words a person can grep for: "api/match". */
  where: string;
  [key: string]: unknown;
};

/** Prefix every line so `[takemore]` finds all of them in a Vercel log. */
const TAG = "[takemore]";

/**
 * Personal information must not leave the building.
 *
 * The storefront handles enquiry emails and the ops app handles customer names,
 * phone numbers and addresses, all of it under POPIA. Sentry is a sub-processor
 * the privacy notice has to name, and the less it holds the smaller that
 * commitment is. Anything on this list is replaced with a marker before it
 * reaches the wire — here as well as in each app's `beforeSend`, because
 * defence in depth is cheap and a forgotten field is not.
 */
const SENSITIVE = new Set([
  "email",
  "e_mail",
  "phone",
  "phone_e164",
  "full_name",
  "name",
  "address",
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "ip",
  "ip_hash",
]);

export const REDACTED = "[redacted]";

/**
 * Walk a context object and blank anything sensitive.
 *
 * Depth-limited and cycle-safe: this runs inside an error handler, where an
 * infinite loop would turn a logged failure into a hung request.
 */
export function scrub(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => scrub(entry, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE.has(key.toLowerCase()) ? REDACTED : scrub(entry, depth + 1, seen);
  }
  return out;
}

/** Anything can be thrown in JavaScript. Get something loggable out of it. */
const describe = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

/**
 * Something failed. Say so in the logs, and tell Sentry if it is listening.
 *
 * Pass the caught value straight through — Error, PostgrestError, string, an
 * object with a `message`, whatever came back. Sentry keeps stack traces when
 * it gets a real Error, so prefer handing it one where you have one.
 */
export function reportError(error: unknown, context?: ErrorContext): void {
  try {
    const where = context?.where ?? "unknown";
    const extra = context ? (scrub({ ...context }) as Record<string, unknown>) : undefined;

    console.error(`${TAG} ${where}:`, describe(error), extra ?? "");

    Sentry.captureException(error instanceof Error ? error : new Error(describe(error)), {
      tags: { where },
      extra,
    });
  } catch {
    // Deliberately empty. Rule 1: reporting a failure must not create one.
  }
}

/**
 * Something noteworthy that is not an exception — a misconfiguration, a
 * ceiling hit, a job that ran long. Same rules.
 */
export function reportMessage(
  message: string,
  context?: Partial<ErrorContext>,
  level: "info" | "warning" | "error" = "warning"
): void {
  try {
    const where = context?.where ?? "unknown";
    const extra = context ? (scrub({ ...context }) as Record<string, unknown>) : undefined;

    const line = `${TAG} ${where}: ${message}`;
    if (level === "error") console.error(line, extra ?? "");
    else if (level === "warning") console.warn(line, extra ?? "");
    else console.info(line, extra ?? "");

    Sentry.captureMessage(message, { level, tags: { where }, extra });
  } catch {
    // See rule 1.
  }
}

/**
 * Say a thing once per process, however many times the code path runs.
 *
 * For conditions that are true for the lifetime of a deployment rather than for
 * one request — "Turnstile is not configured" being the one that prompted this.
 * Without it, a misconfigured production would emit one warning per form
 * submission and drown the signal it was meant to raise.
 */
const alreadySaid = new Set<string>();

export function reportOnce(key: string, message: string, context?: Partial<ErrorContext>): void {
  if (alreadySaid.has(key)) return;
  alreadySaid.add(key);
  reportMessage(message, context);
}

/**
 * The nightly cron, checking in.
 *
 * Sentry Cron Monitors are the only mechanism available here that alerts on
 * ABSENCE. The `cron_runs` table in Postgres records what a run did, which is
 * the more useful of the two on most days — but a job that never fires writes
 * no row, and no row is indistinguishable from an empty table. This catches
 * exactly that case, which is why both exist rather than one.
 *
 * Split into start and finish because Sentry types them as a discriminated
 * union: an in-progress check-in has no id yet, a finished one must quote the
 * id it is finishing. Trying to express both in one call does not typecheck,
 * and the split reads better at the call site anyway.
 */
const CRON_SCHEDULE = {
  schedule: { type: "crontab", value: "0 4 * * *" },
  // Generous on purpose. The sweep is not urgent, and a monitor that cries wolf
  // every few weeks is a monitor somebody mutes — at which point it is worse
  // than not having one, because it looks like coverage.
  checkinMargin: 60,
  maxRuntime: 15,
  timezone: "Africa/Johannesburg",
} as const;

/**
 * Returns the check-in id to hand to cronFinish, or null when Sentry is not
 * configured. Every caller must cope with null — the cron has to run with no
 * monitoring at all.
 */
export function cronStart(monitorSlug: string): string | null {
  try {
    return captureCheckIn({ monitorSlug, status: "in_progress" }, CRON_SCHEDULE);
  } catch {
    return null;
  }
}

export function cronFinish(
  monitorSlug: string,
  checkInId: string | null,
  status: "ok" | "error"
): void {
  if (!checkInId) return;
  try {
    captureCheckIn({ checkInId, monitorSlug, status }, CRON_SCHEDULE);
  } catch {
    // See rule 1.
  }
}
