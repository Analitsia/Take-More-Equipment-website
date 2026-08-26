"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@takemore/db/admin";
import { requireStaff, supabase } from "@/lib/supabase";
import { canManageTeam } from "@takemore/core";

export type TeamResult = { ok: true; password?: string } | { ok: false; error: string };

/** What a warehouse reads instead of a Postgres or GoTrue sentence. */
const humanise = (message: string): string => {
  if (/already|exists/i.test(message)) return "That email already has an account.";
  if (/invalid.*email|email.*invalid/i.test(message)) return "That does not look like an email address.";
  if (/full_name/i.test(message)) return "Enter their name.";
  if (/permission denied|row-level security/i.test(message)) return "Owners only.";
  if (/fetch failed|network|timeout/i.test(message)) return "Could not reach the server. Check the connection and try again.";
  return "That did not work. Try again in a moment.";
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const makePassword = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/**
 * Add somebody to the team.
 *
 * Creating an auth user needs the admin key, so this is one of the few places
 * that reaches for it — behind an explicit owner check, because SECURITY
 * DEFINER-style power in application code deserves the same suspicion it gets
 * in SQL.
 *
 * The generated password is returned exactly once, for the owner to hand over
 * — the screen offers to open WhatsApp with it typed out. There is no
 * password-reset email flow, so the alternative would be an account nobody can
 * get into; if it is lost, the account is remade.
 *
 * No role is chosen because there are none to choose. Everybody who is let in
 * can do everything — see 20260819110000_one_team_no_ranks.sql.
 */
export async function inviteStaff(
  email: string,
  fullName: string
): Promise<TeamResult> {
  const staff = await requireStaff();
  if (!canManageTeam(staff.role)) return { ok: false, error: "Owners only." };

  // Checked here, not only by the database: the constraint's message names a
  // relation and a check, and the person reading it is holding a phone.
  const address = email.trim().toLowerCase();
  const name = fullName.trim().replace(/\s+/g, " ");
  if (!EMAIL.test(address)) return { ok: false, error: "That does not look like an email address." };
  if (name.length < 2) return { ok: false, error: "Enter their name." };

  const admin = createAdminClient();
  const password = makePassword();

  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error("inviteStaff: createUser failed:", error.message);
    return { ok: false, error: humanise(error.message) };
  }

  const { error: profileError } = await admin.from("staff_profiles").insert({
    user_id: data.user.id,
    full_name: name,
    // Everybody lands as 'staff' and it means nothing — 20260819110000 made
    // every rank the same. The column stays because it is what makes putting
    // ranks back a one-line decision rather than a migration.
    role: "staff",
    // Approved on creation. An owner typing someone's name into this form IS
    // the approval — routing them through the pending queue afterwards would
    // mean approving the same person twice.
    approved_at: new Date().toISOString(),
  });

  if (profileError) {
    // Do not leave an auth user with no profile — it would be an account that
    // can authenticate but is not staff, which is confusing to debug later.
    const { error: rollbackError } = await admin.auth.admin.deleteUser(data.user.id);
    if (rollbackError) {
      console.error("inviteStaff: profile insert failed AND the auth user could not be removed:", rollbackError.message);
    }
    console.error("inviteStaff: profile insert failed:", profileError.message);
    return { ok: false, error: humanise(profileError.message) };
  }

  revalidatePath("/team");
  return { ok: true, password };
}

/**
 * A new password for somebody who lost theirs.
 *
 * There is no reset email in this system, and remaking the account — the old
 * answer — loses the name on every log entry from that day on. So the owner
 * hands out a fresh password the same way the first one was handed out: shown
 * once, sent over WhatsApp, changed by the person once they are in.
 *
 * Not for yourself: your own password is changed on the Account page against
 * the current one, which is what keeps an unlocked phone from locking you out.
 */
export async function resetPassword(userId: string): Promise<TeamResult> {
  const staff = await requireStaff();
  if (!canManageTeam(staff.role)) return { ok: false, error: "Owners only." };
  if (userId === staff.userId)
    return { ok: false, error: "Change your own password from Account." };

  const password = makePassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  if (error) {
    console.error("resetPassword failed:", error.message);
    return { ok: false, error: humanise(error.message) };
  }

  return { ok: true, password };
}

/**
 * Let somebody in.
 *
 * Setting `approved_at` is the entire grant. app.staff_role() reads it, every
 * other role helper is built on that function, and every RLS policy in the
 * schema calls one of those — so this one column write is what turns a row that
 * can do nothing into a member of the team.
 *
 * It takes effect on that person's NEXT PAGE LOAD, not on their next token
 * refresh, because the role is read from the table rather than from a JWT
 * claim. That is why approval needs no email and no re-authentication: the
 * session they already hold starts working. Their waiting screen polls, so in
 * practice they are through within seconds of this returning.
 *
 * The role is chosen here rather than at request time, deliberately — the
 * person asking should not get to nominate what they can see, and the owner is
 * making one decision, not two.
 *
 * Through the staff client so the "owner manages the team" policy is what
 * authorises it. The check above is the courtesy; RLS is the rule.
 */
export async function approveRequest(userId: string): Promise<TeamResult> {
  const staff = await requireStaff();
  if (!canManageTeam(staff.role)) return { ok: false, error: "Owners only." };

  const client = await supabase();
  const { error } = await client
    .from("staff_profiles")
    .update({ role: "staff", active: true, approved_at: new Date().toISOString() })
    .eq("user_id", userId)
    // Only ever actions an outstanding request. Without this, a stale tab could
    // re-approve — and so re-date — somebody who has since been deactivated,
    // quietly handing back access that was deliberately taken away.
    .is("approved_at", null);

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/team");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Turn somebody away.
 *
 * Deletes the account outright rather than marking it refused. Two reasons: the
 * address is then free to ask again (people mistype their own email, and a
 * permanent tombstone over a typo is a support call), and an account that can
 * authenticate but exists only to be denied is a row that will confuse whoever
 * reads this table in a year.
 *
 * Deleting the auth user is enough — staff_profiles.user_id carries
 * `on delete cascade`, so the profile goes with it and there is no window in
 * which one exists without the other. The admin key is needed because deleting
 * an auth user is not something any RLS policy can express.
 *
 * Guarded on approved_at being null: this must never become a way to delete a
 * colleague. Removing an approved member is Deactivate, which is reversible.
 */
export async function rejectRequest(userId: string): Promise<TeamResult> {
  const staff = await requireStaff();
  if (!canManageTeam(staff.role)) return { ok: false, error: "Owners only." };
  if (userId === staff.userId) return { ok: false, error: "That is your own account." };

  const client = await supabase();
  const { data: target, error: readError } = await client
    .from("staff_profiles")
    .select("approved_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) return { ok: false, error: humanise(readError.message) };
  if (!target) return { ok: false, error: "That request no longer exists." };
  if (target.approved_at)
    return {
      ok: false,
      error: "That person has already been approved. Deactivate them instead.",
    };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/team");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * setRole() used to live here.
 *
 * It is gone with the ranks it set — 20260819110000_one_team_no_ranks.sql. The
 * column it wrote to still exists and every row says 'staff' except the
 * owner's; changing it changes nothing until that migration's one function is
 * put back.
 */

export async function setActive(userId: string, active: boolean): Promise<TeamResult> {
  const staff = await requireStaff();
  if (!canManageTeam(staff.role)) return { ok: false, error: "Owners only." };
  if (userId === staff.userId)
    return { ok: false, error: "You cannot deactivate yourself." };

  const client = await supabase();
  const { error } = await client.from("staff_profiles").update({ active }).eq("user_id", userId);
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/team");
  return { ok: true };
}
