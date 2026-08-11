"use client";

import { useEffect } from "react";

/**
 * The template pulled <iconify-icon> from a CDN script tag. Here we load the
 * same web component from the bundled package, once, on the client — and hand
 * it every icon the site renders, already resolved, in the same breath.
 *
 * Without the bundle, each icon's SVG is fetched from api.iconify.design the
 * first time it appears, so the first paint of every visit carried
 * icon-shaped holes that filled in when the network allowed — the opposite of
 * a premium first impression. The generated collection
 * (scripts/bundle-icons.mjs) covers the lot in ~20 KB and paints on the first
 * frame.
 *
 * The API fallback stays intact for any icon added without re-running
 * `npm run icons` — it renders exactly as before, just a beat later.
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
