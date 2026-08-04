import type { Config } from "tailwindcss";

// Mirrors the tailwind.config from the source template 1:1.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#080805",
        foreground: "#ffffff",
        accent: "#D4D414",
        card: "#121212",
        border: "#2A2A2A",
        muted: "#888888",
      },
      fontFamily: {
        sans: ["var(--font-figtree)", "Figtree", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
