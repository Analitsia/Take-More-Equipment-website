"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@takemore/db";
import { Button, Field, Input } from "@takemore/ui";

/**
 * Changing your own password.
 *
 * Done in the browser, like signing in, rather than through a server action
 * holding the admin key. The distinction matters: this way the change is
 * authorised by the session it belongs to, and a bug here can only ever affect
 * the person typing. Nothing in this file can touch anyone else's account.
 *
 * Supabase does not ask for the old password on updateUser(), so this form
 * does. Without that check, an unlocked phone left on a workbench is enough for
 * someone to lock its owner out — and in a warehouse the phone is the desk.
 */

/** Above Supabase's own minimum of 6, which is too low for an account that prices stock. */
const MIN_LENGTH = 10;

export default function PasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);

    // Checked here first so an obvious slip costs no round trip.
    if (next.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    if (next === current) {
      setError("That is already your password.");
      return;
    }

    setBusy(true);
    const client = createBrowserClient();

    // Re-authenticate. A failed attempt leaves the existing session untouched;
    // a successful one simply re-issues it for the same person.
    const { error: reauthError } = await client.auth.signInWithPassword({
      email,
      password: current,
    });

    if (reauthError) {
      setError("That is not your current password.");
      setBusy(false);
      return;
    }

    const { error: updateError } = await client.auth.updateUser({ password: next });

    if (updateError) {
      // Passed through rather than rewritten: what comes back here is a policy
      // rejection from the project's own password rules, and a worker can only
      // act on it if they can read what it actually says.
      setError(updateError.message);
      setBusy(false);
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
    setBusy(false);
    // The tokens rotate on a password change. Refresh so the server components
    // re-render against the new cookie rather than the one just replaced.
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Not shown, but present: password managers need a username beside the
          fields to know which login they are being asked to update. */}
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />

      <Field label="Current password">
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>

      <Field label="New password" hint={`${MIN_LENGTH} characters or more`}>
        <Input
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_LENGTH}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>

      <Field label="New password again">
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      {error && (
        <p className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}

      {done && (
        <p className="text-xs text-accent bg-accent/10 border border-accent/30 rounded-xl px-3 py-2.5">
          Password changed. Use the new one next time you sign in.
        </p>
      )}

      <Button type="submit" loading={busy} className="w-full sm:w-auto">
        Change password
      </Button>
    </form>
  );
}
