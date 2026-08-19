"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@takemore/db/admin";
import { requireStaff, supabase } from "@/lib/supabase";
import { canManageTeam } from "@takemore/core";

export type TeamResult = { ok: true; password?: string } | { ok: false; error: string };

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

  const admin = createAdminClient();
  const password = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("already")
        ? "That email already has an account."
        : error.message,
    };
  }

  const { error: profileError } = await admin.from("staff_profiles").insert({
    user_id: data.user.id,
    full_name: fullName.trim(),
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
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/team");
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

  if (error) return { ok: false, error: error.message };

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

  if (readError) return { ok: false, error: readError.message };
  if (!target) return { ok: false, error: "That request no longer exists." };
  if (target.approved_at)
    return {
      ok: false,
      error: "That person has already been approved. Deactivate them instead.",
    };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

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
  if (error) return { ok: false, error: error.message };

  revalidatePath("/team");
  return { ok: true };
}
