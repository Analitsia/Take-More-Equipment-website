"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A navigation link that knows whether you are standing on it.
 *
 * The rail lists eight destinations that all look identical, so the only way to
 * answer "which page am I on?" was to read the heading in the middle of the
 * screen — or, on a phone, to remember which thumb-tap got you here. Lighting
 * the current entry in the accent answers it in peripheral vision, before
 * anyone has to read anything.
 *
 * ── Why the styles arrive as two separate strings ─────────────────────────
 *
 * `idle` and `active` are applied one or the other, never concatenated. Both
 * carry a text colour, and Tailwind resolves two competing colour utilities by
 * the order they sit in the stylesheet, not the order they appear in the
 * attribute — so appending an active colour to a class list that already has an
 * idle one is a coin toss. Keeping them mutually exclusive makes it a certainty.
 *
 * Colour is not the only cue: the current entry also takes a faint accent wash
 * and a heavier weight where it is set from the caller, because a rail read at
 * arm's length under warehouse lighting — or by someone who does not separate
 * teal from grey — should still show which row is lit.
 */

/**
 * Destinations with no entry of their own, and the entry they belong under.
 *
 * The board is the stock seen a different way: same machines, arranged by where
 * they are in the workshop. It is reached from the Dashboard's stage strip, but
 * it is Stock that should light up while you are there — the page says "Board"
 * and lists machines, and pointing at the dashboard instead would be the rail
 * disagreeing with the screen.
 */
const PARENT_OF: Record<string, string> = {
  "/board": "/items",
};

/**
 * Whether `href` is the entry that owns the page currently on screen.
 *
 * A prefix match is what keeps Stock lit while you are three taps deep in one
 * machine. The Dashboard is the exception it always is: at "/" a prefix match
 * would light everything, so it has to be exact.
 */
export function isCurrentPath(pathname: string, href: string): boolean {
  const path = PARENT_OF[pathname] ?? pathname;
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

export default function NavLink({
  href,
  className = "",
  idle = "",
  active = "",
  ariaLabel,
  children,
}: {
  href: string;
  /** Layout and anything else that does not change with the state. */
  className?: string;
  /** Applied when this is not the current page. */
  idle?: string;
  /** Applied instead of `idle` when it is. */
  active?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = isCurrentPath(pathname ?? "/", href);

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      // The same fact the colour states, said out loud for a screen reader —
      // which is the reader that gets nothing at all from a teal row.
      aria-current={current ? "page" : undefined}
      className={`${className} ${current ? active : idle}`}
    >
      {children}
    </Link>
  );
}
