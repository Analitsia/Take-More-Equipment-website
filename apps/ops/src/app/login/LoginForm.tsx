"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@takemore/db";
import { Button, Field, Input } from "@takemore/ui";
import { requestAccess } from "./actions";

type Mode = "signin" | "request";

/**
 * One screen, two doors.
 *
 * A new starter and a returning one arrive at the same URL and cannot be told
 * apart, so both paths are on the first screen rather than behind a link. Sign
 * in leads; requesting access is the quieter option, because most openings of
 * this page are the daily one.
 *
 * After a successful request the person is signed straight in — the account is
 * real from the moment it is created, it simply has no permissions yet. That
 * lands them on /pending, which is a screen that explains itself and updates on
 * its own when the owner approves. The alternative ("check back later") sends
 * someone away with nothing to look at and no idea what happens next.
 */
export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function signIn() {
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

  async function request() {
    const result = await requestAccess(name, email, password);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    // The account exists and is confirmed, so this always succeeds. Signing in
    // here rather than asking them to do it themselves is what makes the
    // handover to /pending seamless.
    const client = createBrowserClient();
    await client.auth.signInWithPassword({ email: email.trim(), password });

    router.replace("/pending");
    router.refresh();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    if (mode === "signin") await signIn();
    else await request();
  }

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Sign in or request access"
        className="grid grid-cols-2 gap-1 p-1 bg-card border border-border rounded-xl"
      >
        {(
          [
            ["signin", "Sign in"],
            ["request", "Request access"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchTo(value)}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              mode === value
                ? "bg-accent text-background"
                : "text-muted hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "request" && (
          <Field label="Your name" required>
            <Input
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sipho Ndlovu"
            />
          </Field>
        )}

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

        <Field
          label="Password"
          required
          hint={mode === "request" ? "8 characters or more" : undefined}
        >
          <Input
            type="password"
            autoComplete={mode === "request" ? "new-password" : "current-password"}
            required
            minLength={mode === "request" ? 8 : undefined}
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
          {mode === "signin" ? "Sign in" : "Send the request"}
        </Button>

        {mode === "request" && (
          <p className="text-[11px] font-light text-muted leading-relaxed">
            You choose your own password now. The owner is told you asked, and
            once they let you in this same password works — there is no email to
            wait for.
          </p>
        )}
      </form>
    </div>
  );
}
