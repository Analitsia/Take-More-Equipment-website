"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@takemore/db/admin";
import { requireStaff, supabase } from "@/lib/supabase";
import { canManageTeam, type AppRole } from "@takemore/core";

export type TeamResult = { ok: true; password?: string } | { ok: false; error: string };

/**
 * Invite a staff member.
 *
 * Creating an auth user needs the admin key, so this is one of the few places
 * that reaches for it — behind an explicit owner check, because SECURITY
 * DEFINER-style power in application code deserves the same suspicion it gets
 * in SQL.
 *
 * The generated password is returned exactly once, for the owner to hand over.
 * There is no password-reset email flow yet, so the alternative would be an
 * account nobody can get into.
 */
export async function inviteStaff(
  email: string,
  fullName: string,
  role: AppRole
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

  const { error: profileError } = await admin
    .from("staff_profiles")
    .insert({ user_id: data.user.id, full_name: fullName.trim(), role });

  if (profileError) {
    // Do not leave an auth user with no profile — it would be an account that
    // can authenticate but is not staff, which is confusing to debug later.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/team");
  return { ok: true, password };
}

export async function setRole(userId: string, role: AppRole): Promise<TeamResult> {
  const staff = await requireStaff();
  if (!canManageTeam(staff.role)) return { ok: false, error: "Owners only." };
  if (userId === staff.userId)
    return { ok: false, error: "You cannot change your own role." };

  // Through the staff client, so the owner policy is what authorises this
  // rather than the admin key. The check above is the courtesy; RLS is the rule.
  const client = await supabase();
  const { error } = await client.from("staff_profiles").update({ role }).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/team");
  return { ok: true };
}

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
