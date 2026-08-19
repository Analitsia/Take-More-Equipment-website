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
 *
 * ── On the accent, and why it is not the logo's teal exactly ───────────────
 *
 * The mark is drawn in #123f42. Read against this app's near-black surface
 * that colour scores 1.7:1 — below the 3:1 floor for a shape and nowhere near
 * the 4.5:1 a word needs, so as an accent it is not dark, it is absent. The
 * mark gets away with it because it never appears on black: it ships in a
 * light-on-dark cut, or on its own cream tile.
 *
 * The accent is therefore the same colour, not a different one — hue 184° and
 * 57% saturation are lifted straight off #123f42, and only the lightness moves,
 * 16% → 44%. That clears 7:1 both ways: as a word on the page, and as the dark
 * label sitting on a filled accent button. The deep #123f42 keeps the jobs it
 * is actually good at, which are surfaces and light backgrounds — the emails
 * use it as their link colour, where it reads 11.6:1 on white.
 */
const preset: Partial<Config> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#080805",
        foreground: "#ffffff",
        accent: "#30A8B0",
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
          listed: "#30A8B0",
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
