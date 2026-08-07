/**
 * Create the first owner account.
 *
 *   node --env-file=.env.local scripts/create-owner.mjs <email>
 *
 * This is a bootstrap, run once. Nothing in staff_profiles can be created
 * through the RLS policies, because they require an owner to already exist —
 * so the very first row has to come from the secret key, which bypasses them.
 * Every account after this one is created from inside the ops app.
 *
 * The generated password is written to FIRST-LOGIN.local.md (gitignored) rather
 * than printed, so it does not end up in a terminal scrollback, a CI log or a
 * chat transcript. Change it on first sign-in and delete the file.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/create-owner.mjs <email>");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } }
);

// 24 bytes of base64url — comfortably beyond anything worth brute-forcing, and
// temporary regardless.
const password = randomBytes(24).toString("base64url");

const existing = await admin.auth.admin.listUsers();
const already = existing.data?.users?.find((u) => u.email === email);

let userId;
if (already) {
  userId = already.id;
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(`reset password: ${error.message}`);
  console.log(`Existing auth user found for ${email} — password reset.`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  userId = data.user.id;
  console.log(`Created auth user for ${email}.`);
}

const { error: profileError } = await admin
  .from("staff_profiles")
  .upsert(
    { user_id: userId, full_name: "Carlo", role: "owner", active: true },
    { onConflict: "user_id" }
  );
if (profileError) throw new Error(`staff_profiles: ${profileError.message}`);

writeFileSync(
  "FIRST-LOGIN.local.md",
  `# Ops first login

This file is gitignored. Delete it once you have changed the password.

    email:    ${email}
    password: ${password}

Role: owner — full access, including costs, margin and team management.

The ops app does not exist yet, so there is nowhere to sign in to right now.
When it does, sign in with these and change the password immediately.
`,
  "utf8"
);

console.log("staff_profiles row upserted with role=owner.");
console.log("Password written to FIRST-LOGIN.local.md (gitignored).");
