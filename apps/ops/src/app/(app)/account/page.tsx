import { requireStaff } from "@/lib/supabase";
import { ROLE_LABELS } from "@takemore/core";
import { Panel } from "@takemore/ui";
import PasswordForm from "./PasswordForm";

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

      <p className="text-[11px] font-light text-muted px-1 leading-relaxed">
        Changing your password does not sign you out here. If you think someone
        else knows it, change it and then sign out everywhere else by signing in
        again on your own devices.
      </p>
    </div>
  );
}
