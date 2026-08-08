/**
 * Proving there is a person on the other end.
 *
 * NOT EXPORTED FROM ./index.ts, DELIBERATELY. Import it as
 * `@takemore/core/turnstile`, mirroring `@takemore/db/admin` — the barrel is
 * pulled into storefront client bundles by EquipmentCard and friends, and a
 * module that reads TURNSTILE_SECRET_KEY must never be reachable from there.
 * Making the import explicit means it shows up in a diff.
 *
 * ── What this is protecting ───────────────────────────────────────────────
 *
 * Two forms that an unauthenticated stranger can post to as often as they like:
 *
 *   capture_lead()  — reachable directly over PostgREST with the publishable
 *                     key that every visitor's browser already holds, so the
 *                     honeypot in the Next.js server action is trivially
 *                     bypassed by not using the form at all.
 *   requestAccess() — creates a REAL Supabase Auth user per call.
 *
 * Cloudflare Turnstile is the right shape of defence for both: it proves a
 * human without us storing anything about them, which matters because the SQL
 * ceilings deliberately hold no IP addresses (POPIA), and a CAPTCHA nobody has
 * to solve is one nobody resents.
 *
 * ── The unset-key decision ────────────────────────────────────────────────
 *
 * Environment-dependent, and loud. See `verifyTurnstile` for the reasoning; it
 * is the single most consequential choice in this file.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileVerdict =
  | { ok: true; reason: "verified" | "not-configured" }
  | { ok: false; reason: "missing-token" | "rejected" | "unreachable" | "not-configured" };

/** Copy for a person, not for a log. Every failure names the way out. */
export function turnstileMessage(reason: TurnstileVerdict["reason"]): string {
  switch (reason) {
    case "missing-token":
      return "Please complete the check just above the button, then try again.";
    case "rejected":
      return "That check did not pass. Please try again, or WhatsApp us — we always answer that.";
    case "unreachable":
      return "We could not complete the security check just now. Please try again in a moment, or WhatsApp us.";
    case "not-configured":
      return "Our enquiry form is briefly unavailable. Please WhatsApp us — we always answer that.";
    default:
      return "Please try again, or WhatsApp us.";
  }
}

/**
 * Is this submission from a person?
 *
 * @param token    the `cf-turnstile-response` field the widget writes into the form
 * @param remoteIp the caller's address, if known. Sent to Cloudflare, never stored.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<TurnstileVerdict> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    /**
     * FAIL CLOSED IN PRODUCTION, OPEN EVERYWHERE ELSE.
     *
     * Why not fail open with a warning: a warning in a log nobody reads is
     * indistinguishable from no protection at all, and that is precisely the
     * bug this whole branch of work exists to fix — next.config.mjs carried a
     * comment claiming CI blocked placeholder media, and there was no CI. An
     * unguarded form shipping quietly to production would be the same mistake
     * with a different filename.
     *
     * Why not fail closed everywhere: it would break local development, break
     * CI, and break `npm run test:leads`, which posts through this path.
     *
     * The cost of this choice, stated plainly: deploying to production without
     * setting the key takes the enquiry form offline. Three things exist so
     * that cannot happen silently — `launch.security.turnstile` in the launch
     * manifest must be verified before launchState can be "live",
     * /api/health reports `turnstileConfigured`, and the caller reports a
     * `TurnstileNotConfigured` event on every attempt.
     */
    const inProduction = process.env.VERCEL_ENV === "production";
    return inProduction
      ? { ok: false, reason: "not-configured" }
      : { ok: true, reason: "not-configured" };
  }

  if (!token) return { ok: false, reason: "missing-token" };

  const body = new URLSearchParams({
    secret,
    response: token,
    // A Turnstile token is single-use. Without an idempotency key a retry of a
    // request whose first attempt timed out is rejected as a replay, and the
    // person is told they failed a check they actually passed.
    idempotency_key: crypto.randomUUID(),
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return { ok: false, reason: "unreachable" };

    const result = (await response.json()) as { success?: boolean };
    return result.success === true
      ? { ok: true, reason: "verified" }
      : { ok: false, reason: "rejected" };
  } catch {
    // Cloudflare is down, or the network is. Refuse rather than wave through:
    // this branch is reachable only when a secret IS configured, so somebody
    // has decided this form should be guarded, and a guard that opens under
    // load is what a determined script would aim for.
    return { ok: false, reason: "unreachable" };
  }
}

/**
 * The caller's address, best effort, for Cloudflare's own risk scoring.
 *
 * First hop of x-forwarded-for only. The rest of the chain is attacker-supplied
 * on any request that did not come through our own proxy, and the first entry
 * is what Vercel puts there.
 */
export function callerIp(headers: {
  get(name: string): string | null;
}): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
