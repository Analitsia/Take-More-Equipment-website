import type { Config } from "tailwindcss";
import preset from "@takemore/ui/tailwind-preset";

// The palette and typeface live in @takemore/ui so the storefront and the ops
// app cannot drift apart — change the accent there and it changes in both
// places, or in neither. This file now only says which files to scan.
const config: Config = {
  presets: [preset as Config],
  content: ["./src/**/*.{ts,tsx}"],
};

export default config;
