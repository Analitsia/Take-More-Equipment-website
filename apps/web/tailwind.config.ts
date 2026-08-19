import type { Config } from "tailwindcss";
import preset from "@takemore/ui/tailwind-preset";

// The palette and typeface live in @takemore/ui so the storefront and the ops
// app cannot drift apart — change the accent there and it changes in both
// places, or in neither. This file now only says which files to scan.
const config: Config = {
  presets: [preset as Config],
  content: [
    "./src/**/*.{ts,tsx}",
    // The package this config reads its palette from, and imports a component
    // from. Naming it here is what makes it an input to the stylesheet: without
    // it, an incremental build answers from cache when only the shared palette
    // moved, and ships the previous one. That is not hypothetical — the first
    // deploy of the teal accent went out with the old yellow stylesheet for
    // exactly this reason, while ops, which already listed the package, was
    // correct. The build succeeds either way, so nothing catches it but the
    // rendered page.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
