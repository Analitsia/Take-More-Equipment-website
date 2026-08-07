"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@takemore/db";

export default function SignOutButton({ compact }: { compact?: boolean }) {
  const router = useRouter();

  async function signOut() {
    await createBrowserClient().auth.signOut();
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
