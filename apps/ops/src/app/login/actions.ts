"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@takemore/db/admin";
import { callerIp, turnstileMessage, verifyTurnstile } from "@takemore/core/turnstile";
import { reportError, reportOnce } from "@takemore/observability";

/**
 * Asking to join.
 *
 * WHY THIS IS A SERVER ACTION AND NOT `supabase.auth.signUp()`
 * -----------------------------------------------------------
 * The obvious implementation is client-side signUp() from the browser. It is
 * the wrong one here, for two reasons that both matter:
 *
 *   1. It needs "Allow new users to sign up" turned ON at the Supabase project
 *      level. That switch is not scoped to this app — it opens self-registration
 *      to anyone holding the publishable key, and the STOREFRONT ships that key
 *      to every visitor. Turning it on to get a request form on an ops login
 *      screen would open a door across the whole project to close a gap on one
 *      page.
 *
 *   2. With "Confirm email" on, signUp() returns no session and the person
 *      cannot sign in until they open a link in their inbox. With it off,
 *      anyone can create unlimited accounts. Neither is what we want.
 *
 * Going through the admin key instead keeps project-level signup switched OFF,
 * which means this action is the ONLY route to an account and every constraint
 * below is therefore actually enforced rather than merely one of several paths.
 *
 * `email_confirm: true` creates the account already confirmed. No mail is ever
 * sent, and the password the person chose works the moment an owner approves
 * them — which is the whole point: approval should not require the new starter
 * to go and find an email.
 *
 * The account is real and signs in immediately. It just cannot DO anything: the
 * profile row lands with `approved_at` null, and app.staff_role() returns null
 * for those, so every RLS policy in the schema refuses them until an owner acts.
 */

export type RequestResult = { ok: true } | { ok: false; error: string };

/**
 * The abuse ceilings.
 *
 * This action is unauthenticated by necessity — the whole point is that the
 * person has no account yet — so a script could sit on it and manufacture auth
 * users. The real attack is not the accounts, it is saturating the queue so a
 * legitimate new starter cannot get in.
 *
 * ── Why the counting moved into SQL ───────────────────────────────────────
 *
 * It used to be here, and it could not work here:
 *
 *     const { count } = await admin.from("staff_profiles")...
 *     if ((count ?? 0) >= MAX_PENDING) return { ok: false, ... }
 *
 * Check-then-act across two round trips. Two concurrent callers both read 11
 * and both create. The fix is a lock, and locks live in the database — see
 * claim_access_request() in 20260809090200_access_requests.sql, which holds an
 * advisory lock across the count and the record of the attempt.
 *
 * It could not move ENTIRELY into SQL either, because creating an auth user
 * means calling the GoTrue admin API over HTTP. So the shape is: SQL decides,
 * this file acts, and this file tells SQL how it went. A request that dies
 * between those two points releases its slot after fifteen minutes on its own.
 *
 * The number itself now lives in that migration rather than in a constant here.
 */

const MIN_PASSWORD = 8;

/** What the person is told, per refusal. */
const REFUSALS: Record<string, string> = {
  too_many_pending:
    "There are too many requests waiting. Ask the owner to clear them first.",
  email_throttled:
    "You have asked a few times today already — the owner has it, and will let you in shortly.",
  // Deliberately vague, and deliberately different from the two above: naming
  // a per-origin limit tells somebody probing it exactly what to vary.
  ip_throttled:
    "We cannot take that request right now. Please try again later, or ask the owner directly.",
};

export async function requestAccess(
  fullName: string,
  email: string,
  password: string,
  turnstileToken?: string | null
): Promise<RequestResult> {
  const name = fullName.trim();
  const address = email.trim().toLowerCase();

  if (name.length < 2) return { ok: false, error: "Tell us your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address))
    return { ok: false, error: "That does not look like an email address." };
  if (password.length < MIN_PASSWORD)
    return {
      ok: false,
      error: `Pick a password of at least ${MIN_PASSWORD} characters.`,
    };

  const requestHeaders = await headers();
  const ip = callerIp(requestHeaders);

  // Before anything that costs us something. Creating an auth user is the
  // expensive, hard-to-undo part; the bot check belongs in front of it.
  const verdict = await verifyTurnstile(turnstileToken, ip);
  if (!verdict.ok) {
    if (verdict.reason === "not-configured") {
      reportOnce("turnstile-unconfigured-ops", "Turnstile is not configured in production", {
        where: "ops/requestAccess",
      });
    }
    return { ok: false, error: turnstileMessage(verdict.reason) };
  }

  const admin = createAdminClient();

  /**
   * A fingerprint, never an address.
   *
   * An IP address is personal information under POPIA — holding one means
   * justifying it in the privacy notice and deleting it on request. Hashing it
   * here with a server-side pepper means the database answers the only question
   * we actually have ("same requester as a minute ago?") and cannot answer any
   * other. Without a pepper set, a plain sha256 of an IPv4 address is trivially
   * reversible by brute force, so an unpeppered hash is simply not stored.
   */
  const pepper = process.env.ACCESS_REQUEST_IP_PEPPER;
  if (!pepper) {
    reportOnce(
      "access-request-pepper-missing",
      "ACCESS_REQUEST_IP_PEPPER is not set, so the per-origin throttle is inactive",
      { where: "ops/requestAccess" }
    );
  }
  const ipHash =
    ip && pepper ? createHash("sha256").update(`${pepper}:${ip}`).digest("hex") : null;

  const claim = await admin.rpc("claim_access_request", {
    p_email: address,
    // `undefined` rather than `null` so PostgREST omits the argument and the
    // function's own default applies. Same result, and it typechecks against
    // the generated signature for a parameter that has one.
    p_ip_hash: ipHash ?? undefined,
  });

  if (claim.error) {
    reportError(claim.error, { where: "ops/requestAccess", stage: "claim" });
    return { ok: false, error: "Something went wrong. Please try again shortly." };
  }

  const claimed = Array.isArray(claim.data) ? claim.data[0] : claim.data;
  const outcome = claimed?.outcome ?? "too_many_pending";
  const requestId = claimed?.request_id ?? null;

  if (outcome !== "allowed") {
    return { ok: false, error: REFUSALS[outcome] ?? REFUSALS.too_many_pending };
  }

  /** Release the slot the claim above reserved, whichever way this ends. */
  const settle = async (succeeded: boolean) => {
    if (!requestId) return;
    const { error } = await admin.rpc("settle_access_request", {
      p_request_id: requestId,
      p_succeeded: succeeded,
    });
    if (error) reportError(error, { where: "ops/requestAccess", stage: "settle" });
  };

  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password,
    email_confirm: true,
  });

  if (error) {
    await settle(false);
    // Named plainly rather than kept vague.
    //
    // The sign-in form one screen over is deliberately ambiguous about whether
    // an address exists, because there the ambiguity costs an attacker
    // something and costs a legitimate user nothing. Here it is the reverse: a
    // new starter typing their work address would get an unexplained failure
    // and retype it forever, while the thing being "protected" is whether an
    // address works at a warehouse ops subdomain that is useless without an
    // owner's approval anyway.
    if (error.message.toLowerCase().includes("already")) {
      return {
        ok: false,
        error: "That email already has an account here — try signing in instead.",
      };
    }
    reportError(error, { where: "ops/requestAccess", stage: "createUser" });
    return { ok: false, error: "We could not create that account. Please try again." };
  }

  const { error: profileError } = await admin.from("staff_profiles").insert({
    user_id: data.user.id,
    full_name: name,
    // The role is a placeholder until an owner chooses one at approval. It is
    // inert while approved_at is null — staff_role() reads null for this row
    // regardless of what sits in this column.
    role: "staff",
    // Not deactivated — nobody has decided anything yet. `approved_at` left
    // null is what marks this as a request rather than a member.
    active: true,
  });

  if (profileError) {
    // Never leave an auth user with no profile: it would be an account that can
    // authenticate, is not staff, and does not appear in anyone's queue — an
    // invisible row that only surfaces as a confusing bug months later.
    await admin.auth.admin.deleteUser(data.user.id);
    await settle(false);
    reportError(profileError, { where: "ops/requestAccess", stage: "profile" });
    return { ok: false, error: "We could not create that account. Please try again." };
  }

  // The profile row now exists, so the queue can count it directly and this
  // request's reserved slot is no longer needed.
  await settle(true);

  return { ok: true };
}
