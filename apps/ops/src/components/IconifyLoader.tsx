"use client";

import { useEffect } from "react";

/**
 * Registers the <iconify-icon> custom element once, on the client — and hands
 * it every icon this app renders, already resolved, in the same breath.
 *
 * Without the bundle, <iconify-icon> fetches each icon's SVG from
 * api.iconify.design the first time it appears, which on a warehouse phone
 * meant every screen's first paint had icon-shaped holes that filled in when
 * the network allowed. The generated collection (scripts/bundle-icons.mjs)
 * is ~20 KB for the lot and paints on the first frame, offline included.
 *
 * Registering the data in the same tick as the element keeps the API fallback
 * intact for any icon added without re-running `npm run icons` — it renders
 * exactly as before, just a beat later.
 */
export default function IconifyLoader() {
  useEffect(() => {
    (async () => {
      const [{ addCollection }, { iconCollections }] = await Promise.all([
        import("iconify-icon"),
        import("@takemore/ui/icons"),
      ]);
      for (const collection of iconCollections) addCollection(collection);
    })();
  }, []);
  return null;
}
