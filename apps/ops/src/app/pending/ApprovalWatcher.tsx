"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-asks the server whether approval has landed yet.
 *
 * The point of this whole flow is that being let in requires nothing of the
 * person waiting — no email, no link, no second sign-in. That promise breaks if
 * they have to know to press refresh. So the page does it for them, and the
 * redirect out of here happens in the server component when the answer changes.
 *
 * Polling rather than a realtime subscription, deliberately: a websocket held
 * open by someone who is not yet allowed to read anything is a lot of machinery
 * for one boolean, and the row it would watch is one this account can only just
 * barely see. Fifteen seconds is well inside the time it takes an owner to tap
 * approve and say "try now".
 *
 * The interval is cleared on unmount, and pauses while the tab is hidden — a
 * phone left on a bench overnight should not spend the night polling.
 */
const EVERY_MS = 15_000;

export default function ApprovalWatcher() {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    const timer = setInterval(tick, EVERY_MS);
    // Coming back to the tab is itself a good moment to check, and covers the
    // common case of a phone unlocked to see whether it worked yet.
    document.addEventListener("visibilitychange", tick);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  return null;
}
