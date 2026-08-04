"use client";

import { useEffect } from "react";

/**
 * The template pulled <iconify-icon> from a CDN script tag. Here we load the
 * same web component from the bundled package, once, on the client.
 */
export default function IconifyLoader() {
  useEffect(() => {
    import("iconify-icon");
  }, []);

  return null;
}
