"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@takemore/db";
import { Button, Field, Input } from "@takemore/ui";

/**
 * One screen, one door.
 *
 * It used to have two: sign in, and a "Request access" tab where somebody could
 * create their own account for the owner to approve. That tab is gone, and the
 * server action behind it now refuses, on the owner's decision — accounts are
 * made in /team, where the system generates a password and the owner sends it
 * over WhatsApp. It is a family business of a handful of people; a queue was
 * ceremony for something that happens twice a year and is settled in person.
 *
 * Two things it also fixed, which is worth writing down:
 *
 *   The request path was the only unauthenticated form here, and the only
 *   reason this app needed a Turnstile key at all. Without one configured, it
 *   fails closed in production — so on the day this was looked at, the tab was
 *   on the screen and refused every request with "briefly unavailable". A door
 *   that does not open is worse than no door.
 *
 *   Approval into the ops app is now the only thing between somebody and every
 *   cost and margin in the business, because costs and ranks both opened up in
 *   August 2026. Narrowing account creation to one person is what pays for
 *   that.
 */
export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const client = createBrowserClient();
    const { error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      // Deliberately vague. Distinguishing "no such account" from "wrong
      // password" tells an attacker which addresses are real.
      setError("That email and password don't match an account.");
      setBusy(false);
      return;
    }

    // replace() so the back button does not return to a login form the person
    // has already used; refresh() so the server components re-render with the
    // new cookie rather than serving the cached signed-out tree.
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" required>
        <Input
          type="email"
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field label="Password" required>
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      {error && (
        <p className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}

      <Button type="submit" loading={busy} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
