import type { Config } from "tailwindcss";
import preset from "@takemore/ui/tailwind-preset";

// Same palette and typeface as the storefront, from the same file. The ops app
// differs in density and radius, not in brand — see the design notes in the
// build plan.
const config: Config = {
  presets: [preset as Config],
  content: [
    "./src/**/*.{ts,tsx}",
    // The shared form kit lives outside this app, so Tailwind has to scan it or
    // its classes never make it into the stylesheet.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
