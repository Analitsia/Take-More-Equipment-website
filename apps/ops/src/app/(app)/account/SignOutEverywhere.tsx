"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@takemore/db";
import { Button } from "@takemore/ui";

/**
 * The global sign-out, on its own button.
 *
 * The one in the corner is local — it signs out this device only, because
 * tapping it on the warehouse phone should not also close the laptop in the
 * office. This is the other one, for a lost phone: every session for this
 * account is revoked, including the one pressing the button.
 */
export default function SignOutEverywhere() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!window.confirm("Sign out of every device, including this one?")) return;
    setBusy(true);
    setError(null);
    const { error: signOutError } = await createBrowserClient().auth.signOut({ scope: "global" });
    if (signOutError) {
      setBusy(false);
      return setError("That did not work. Check the connection and try again.");
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" onClick={run} loading={busy}>
        Sign out everywhere
      </Button>
      {error && <p className="text-xs text-status-sold">{error}</p>}
    </div>
  );
}
