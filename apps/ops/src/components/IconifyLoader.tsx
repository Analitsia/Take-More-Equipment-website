"use client";

import { useEffect } from "react";

/**
 * Registers the <iconify-icon> custom element once, on the client.
 *
 * Same approach as the storefront: a dynamic import rather than a bundled
 * dependency, so icon SVGs are fetched on demand instead of shipped.
 */
export default function IconifyLoader() {
  useEffect(() => {
    import("iconify-icon");
  }, []);
  return null;
}
