"use client";

import { useEffect, useState } from "react";

/**
 * "Your phone has lost signal" — said out loud, once, at the top.
 *
 * This app is used one-handed, walking around a warehouse, on a phone that
 * drops to no bars behind the container. Before this, a save attempted in a
 * dead spot failed with whatever generic message the underlying error produced,
 * which reads as "the app is broken" rather than "walk ten metres".
 *
 * Naming the actual problem is most of the fix. The rest is that the banner
 * stays visible while offline, so somebody who has just watched a save fail can
 * see WHY without having to try again to find out.
 *
 * ── On `navigator.onLine` ─────────────────────────────────────────────────
 *
 * It is famously weak: true means "there is a network interface", not "the
 * internet is reachable". That asymmetry is exactly why it is used only in this
 * direction — FALSE is reliable and is the only thing acted on here. A true
 * reading is treated as "probably fine", never as a guarantee, which is why the
 * retry logic in MediaManager does not consult it at all and simply retries.
 */
export default function ConnectionBanner() {
  // Starts true and is corrected on mount. Rendering "offline" during hydration
  // because the server has no navigator would be a flash of bad news on every
  // page load.
  const [online, setOnline] = useState(true);
  const [everOffline, setEverOffline] = useState(false);

  useEffect(() => {
    const update = () => {
      const next = navigator.onLine;
      setOnline(next);
      if (!next) setEverOffline(true);
    };

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online && !everOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-40 px-4 py-2 text-[11px] font-light flex items-center gap-2 border-b ${
        online
          ? "bg-accent/10 border-accent/30 text-accent"
          : "bg-status-sold/10 border-status-sold/30 text-status-sold"
      }`}
    >
      <iconify-icon
        icon={online ? "solar:wi-fi-router-linear" : "solar:wi-fi-router-minimalistic-broken"}
        width="14"
        height="14"
      ></iconify-icon>
      {online ? (
        <span>Back online. Anything that failed while you were offline can be tried again.</span>
      ) : (
        <span>
          No connection. You can keep looking at what is already on screen, but
          nothing will save until this comes back.
        </span>
      )}
    </div>
  );
}
