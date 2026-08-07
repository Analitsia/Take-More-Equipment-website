"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@takemore/db";
import { Button, Field, Input } from "@takemore/ui";

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

    // refresh() so the server components re-render with the new cookie rather
    // than serving the cached signed-out tree.
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email">
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

      <Field label="Password">
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
