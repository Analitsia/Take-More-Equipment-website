import type { Config } from "tailwindcss";

/**
 * The brand, as a Tailwind preset.
 *
 * Six colours and one typeface is the entire Take More visual system. Both apps
 * extend this preset so the storefront and the tool cannot drift apart — change
 * the accent here and it changes in both places, or it changes in neither.
 *
 * The storefront's own tailwind.config.ts becomes a two-line file that names
 * this preset and its own `content` globs.
 */
const preset: Partial<Config> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#080805",
        foreground: "#ffffff",
        accent: "#D4D414",
        card: "#121212",
        border: "#2A2A2A",
        muted: "#888888",

        /**
         * Status colours — ops only; the storefront never renders these.
         *
         * The brand accent stays reserved for `listed`, so the one saturated
         * colour on the board always means "this unit is live and can make
         * money". The rest are desaturated on purpose: seven fully-saturated
         * columns is a fruit salad, and the eye should be drawn to the money.
         *
         * Every value clears 4.5:1 against both #121212 and #080805, so a
         * status label is readable as text and not only as a dot.
         * `handed_over` deliberately reuses `muted` — it is the archived state,
         * and inventing a second grey for it would be a colour with no job.
         */
        status: {
          intake: "#8A94A6",
          refurbishing: "#D89A3F",
          ready: "#56A98E",
          listed: "#D4D414",
          reserved: "#A98ED4",
          sold: "#D47A85",
          handed_over: "#888888",
        },
      },
      fontFamily: {
        sans: ["var(--font-figtree)", "Figtree", "sans-serif"],
      },
      borderRadius: {
        // The storefront's signature 32px card. Kept available so shared
        // components can use it, but ops panels default to rounded-2xl — see
        // the design notes in the plan: 32px on a data table reads as a toy.
        panel: "2rem",
      },
    },
  },
  plugins: [],
};

export default preset;
