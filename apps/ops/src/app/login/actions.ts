"use server";

import { createAdminClient } from "@takemore/db/admin";

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
 * The abuse ceiling.
 *
 * This action is unauthenticated by necessity — the whole point is that the
 * person has no account yet — so a script could sit on it and manufacture auth
 * users. A cap on OUTSTANDING requests bounds that at something an owner can
 * clear in one screen, without ever locking out a legitimate new starter for
 * long: the number only stays high if nobody is approving or rejecting, and
 * both of those are one tap.
 */
const MAX_PENDING = 12;

const MIN_PASSWORD = 8;

export async function requestAccess(
  fullName: string,
  email: string,
  password: string
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

  const admin = createAdminClient();

  const { count } = await admin
    .from("staff_profiles")
    .select("user_id", { count: "exact", head: true })
    .is("approved_at", null);

  if ((count ?? 0) >= MAX_PENDING) {
    return {
      ok: false,
      error: "There are too many requests waiting. Ask the owner to clear them first.",
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password,
    email_confirm: true,
  });

  if (error) {
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
    return { ok: false, error: error.message };
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
    return { ok: false, error: profileError.message };
  }

  return { ok: true };
}
