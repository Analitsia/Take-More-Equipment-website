"use server";

/**
 * Nobody makes their own account.
 *
 * This file used to hold the self-registration path: a stranger typed a name,
 * an email and a password of their choosing, Turnstile proved they were human,
 * claim_access_request() held an advisory lock while it counted the queue, and
 * the owner approved them afterwards in /team. It was careful work and it is
 * gone, by the owner's decision in August 2026 — accounts are created in /team,
 * where the system generates a password and the owner sends it over WhatsApp.
 *
 * Two things that pushed it:
 *
 *   It was ceremony for something that happens twice a year in a family
 *   business and is settled in person anyway.
 *
 *   Approval into this app is now the ONLY thing between somebody and every
 *   cost and margin Take More has, because costs (20260819090100) and ranks
 *   (20260819110000) both opened up. Narrowing account creation to one person
 *   is what pays for that.
 *
 * ── Putting it back ───────────────────────────────────────────────────────
 *
 * The database half is untouched and still works: claim_access_request() and
 * settle_access_request() in 20260809090200_access_requests.sql, and the
 * `approved_at is null` state that every role helper already understands. The
 * app half is one `git show` away — it was deleted, not rewritten, in the
 * commit that added this comment. The tripwire to remember is
 * TURNSTILE_SECRET_KEY: without it, that path fails closed in production by
 * design, which on the day this was looked at meant a tab on the login screen
 * that refused every request with "briefly unavailable".
 *
 * This still returns a refusal rather than being deleted outright, because the
 * type is imported by the login screen and because an unauthenticated action
 * that creates real auth users should say no in code, not merely have no button
 * pointing at it.
 */

export type RequestResult = { ok: true } | { ok: false; error: string };

export async function requestAccess(): Promise<RequestResult> {
  return {
    ok: false,
    error: "Ask the owner to make you an account — they can do it in a minute.",
  };
}
