"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@takemore/db";

export default function SignOutButton({ compact }: { compact?: boolean }) {
  const router = useRouter();

  async function signOut() {
    // This device only. The default scope is "global", which also signs out
    // the laptop in the office when somebody taps Sign out on the warehouse
    // phone. "Sign out everywhere" lives on the Account page, deliberately.
    await createBrowserClient().auth.signOut({ scope: "local" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className={`text-muted hover:text-white transition-colors ${
        compact ? "text-[11px]" : "text-xs"
      }`}
    >
      Sign out
    </button>
  );
}
