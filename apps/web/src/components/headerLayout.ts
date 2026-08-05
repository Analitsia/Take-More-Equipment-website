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
 *
 * `relative` makes the row a positioning root for the navbar's centered pill
 * (see Navbar.tsx) — inert here, since nothing in the menu overlay's own row
 * needs it, but the two rows still have to share one geometry.
 */
const HEADER_ROW_BASE = "relative w-full px-6 md:px-12 h-10 flex items-center justify-between";

/**
 * `solid` (inner pages) caps and centers at 1440px, matching every section on
 * those pages — About, the catalogue, the footer, all of it. `overlay` (the
 * home hero) stays uncapped instead: every other row stacked in that hero —
 * the "Cape Town" line, the headline, the CTA buttons — carries no 1440 cap
 * of its own either. Capping just the navbar's row would hold it to a
 * *different* reference than its own hero on any screen past ~1470px,
 * pulling the logo right of everything stacked under it by however far that
 * centering shifted it. Uncapped past that width is uncapped, but it will
 * always agree with hero's own rows, for the one page where that agreement
 * matters.
 *
 * Below 1440px both forms are identical — max-w-[1440px] is a no-op once the
 * viewport is already narrower than it — so this only changes anything on a
 * wide desktop monitor, never on mobile or a laptop screen.
 */
export function headerRow(variant: HeaderVariant) {
  return variant === "overlay"
    ? HEADER_ROW_BASE
    : `${HEADER_ROW_BASE} max-w-[1440px] mx-auto`;
}

/**
 * A second, smaller reference mismatch — separate from headerRow()'s cap,
 * and present at every width, not just past 1440px.
 *
 * Hero.tsx's frame — the rounded image, and everything stacked on top of it
 * (the "Cape Town" line, the headline) — sits *inside* an outer wrapper
 * padded by p-2/md:p-4. That padding insets the frame itself by 8px/16px
 * from the real viewport edge, so the hero's own content is measured from
 * that inset edge, not the raw one.
 *
 * The overlay navbar is deliberately rendered as that outer wrapper's other
 * child, a sibling to the frame rather than a child of it (see the comment
 * in Hero.tsx) — that fix keeps the logo from sliding when the menu opens,
 * since the menu overlay is a separate fixed layer with no frame of its own
 * to inherit padding from. But it means the navbar's own inset-x-0 resolves
 * against the *outer* wrapper's padding box, i.e. the raw viewport edge —
 * 8px/16px to the left of where the frame's own content starts.
 *
 * This closes that specific gap: added to the logo only (not the row), so
 * the true-centered pill and the right-side buttons are untouched. ml-2
 * md:ml-4 are the same tokens as Hero's own p-2 md:p-4, so the two move in
 * exact lockstep rather than by a separately-tuned number. `solid` pages
 * have no such frame to match, so this only applies to `overlay`.
 */
export const OVERLAY_LOGO_FRAME_INSET = "ml-2 md:ml-4";

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
