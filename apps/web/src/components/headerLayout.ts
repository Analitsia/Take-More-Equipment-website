/**
 * One geometry for every header row on the site.
 *
 * The logo and the round button on the right appear twice — once in the navbar,
 * once in the header of the menu overlay that covers it — as different elements
 * in different stacking contexts. Any disagreement between the two rows about
 * max-width, horizontal padding or row height reads as the logo and the button
 * jumping the instant the menu opens, so both rows are laid out from here and
 * from nothing else.
 *
 * `h-10` is the load-bearing part: the row is pinned to the height of the round
 * button it holds. Left to size themselves, the two rows disagree from md up,
 * where the navbar also carries the desktop glass pill (46px) and the overlay
 * carries only the 40px close button — a 3px vertical jump.
 */
export const HEADER_ROW =
  "w-full max-w-[1440px] mx-auto px-6 md:px-12 h-10 flex items-center justify-between";

/**
 * The distance from the top of the header's containing block down to the row,
 * per navbar variant. The overlay navbar floats over the hero; the solid one is
 * pinned to the top of an inner page. The menu overlay reads the same value for
 * whichever variant opened it, so its header lands on top of the row it hides.
 */
export const HEADER_TOP = {
  overlay: "pt-6 md:pt-8",
  solid: "pt-4",
} as const;

export type HeaderVariant = keyof typeof HEADER_TOP;
