import { requireStaff } from "@/lib/supabase";
import { ROLE_LABELS } from "@takemore/core";
import { Panel } from "@takemore/ui";
import PasswordForm from "./PasswordForm";
import SignOutEverywhere from "./SignOutEverywhere";

export const dynamic = "force-dynamic";

/**
 * Your own account.
 *
 * Everyone gets this page, unlike /team — a password is the one thing a person
 * must be able to change without asking the owner for it. Role and email are
 * shown but not editable here; who someone is remains the owner's call, made
 * on /team, so that this page can never be a way to promote yourself.
 */
export default async function AccountPage() {
  const staff = await requireStaff();

  return (
    <div className="max-w-lg">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">Account</h1>
        <p className="text-sm font-light text-muted mt-1">
          {staff.fullName} · {ROLE_LABELS[staff.role]}
        </p>
      </header>

      <Panel
        title="Change password"
        subtitle={`Signed in as ${staff.email}`}
        className="mb-4"
      >
        <PasswordForm email={staff.email} />
      </Panel>

      <Panel
        title="Other devices"
        subtitle="Sign out on every phone and laptop this account is signed in on, this one included."
      >
        <p className="text-xs font-light text-muted leading-relaxed mb-3">
          Changing your password does not by itself sign out a phone that is
          already in. If one has been lost, change the password and then press
          this.
        </p>
        <SignOutEverywhere />
      </Panel>
    </div>
  );
}
