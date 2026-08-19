"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import MenuOverlay from "./MenuOverlay";
import SearchOverlay from "./SearchOverlay";
import {
  headerRow,
  HEADER_TOP,
  OVERLAY_LOGO_FRAME_INSET,
  type HeaderVariant,
} from "./headerLayout";

/**
 * Navbar Component
 *
 * `overlay` floats it over the hero exactly as the template did. `solid` pins
 * it to the top of an inner page, where there is no hero behind it.
 *
 * The vertical inset lives on the outer element and the row's own geometry in
 * headerRow(), so the menu overlay can reproduce the row exactly (see
 * headerLayout).
 */
export default function Navbar({
  variant = "overlay",
}: {
  variant?: HeaderVariant;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const position =
    variant === "overlay"
      ? "absolute top-0 inset-x-0 z-50"
      : "sticky top-0 z-50 pb-4 bg-background/80 backdrop-blur-md";

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className={`${position} ${HEADER_TOP[variant]}`}
      >
        <div className={headerRow(variant)}>
          <Link
            href="/"
            aria-label="Take More Equipment — home"
            className={`flex items-center cursor-pointer ${
              variant === "overlay" ? OVERLAY_LOGO_FRAME_INSET : ""
            }`}
          >
            {/* SVG, not a raster crop — vector paths straight from the brand file,
                so it stays crisp at any size instead of softening like a scaled
                PNG. Horizontal lockup (mark + wordmark, ~5.33:1), in the
                light-on-dark cut, because this header always sits on the dark
                page background. Sized by height rather than width: the file
                carries ~15% empty margin above and below the artwork, so
                h-8/sm:h-10 puts the visible mark at roughly the cap height the
                stacked lockup read at. Sizing by height with w-auto grows the
                box to the right, not the left, and the start position comes
                from OVERLAY_LOGO_FRAME_INSET on the Link above — neither
                changes here, so the left edge doesn't move.
                max-w-[60vw]+object-contain guards the narrowest phones, where a
                wide lockup could otherwise reach the search/menu buttons. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/takemore-logo-horizontal.svg"
              alt="Take More Equipment"
              width={1013}
              height={190}
              className="h-8 sm:h-10 w-auto max-w-[60vw] object-contain object-left"
            />
          </Link>

          {/* justify-between only guarantees the *first* and *last* flex
              children sit at the row's true edges — a middle child's position
              still depends on how wide its siblings are, so on this row
              (logo width varies, hamburger group is fixed) the pill drifted
              off the row's actual center. Taking it out of flex flow and
              centering it directly against the row itself (headerRow() marks
              the row `relative` for exactly this) makes its position not
              depend on either sibling's width at all. */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 glass-panel rounded-full px-6 py-2.5 items-center space-x-12">
            <Link
              href="/#catalogue"
              className="flex items-center space-x-2 cursor-pointer hover:text-white/70 transition-colors text-sm font-light"
            >
              <span>Stock</span>
              <iconify-icon icon="solar:alt-arrow-down-linear" width="16" height="16"></iconify-icon>
            </Link>
            <div className="text-white/20">|</div>
            <div className="flex items-center space-x-4">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search stock"
                className="text-white/50 hover:text-white cursor-pointer transition-colors flex items-center"
              >
                <iconify-icon
                  icon="solar:minimalistic-magnifer-linear"
                  width="18"
                  height="18"
                ></iconify-icon>
              </button>
              <Link
                href="/about"
                aria-label="About Take More"
                className="text-white/50 hover:text-white cursor-pointer transition-colors flex items-center"
              >
                <iconify-icon icon="solar:user-linear" width="18" height="18"></iconify-icon>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* The desktop nav panel carries its own search; on mobile it is hidden,
                so search needs its own control next to the menu. */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search stock"
              className="md:hidden glass-panel rounded-full w-10 h-10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors"
            >
              <iconify-icon
                icon="solar:minimalistic-magnifer-linear"
                width="17"
                height="17"
              ></iconify-icon>
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="glass-panel rounded-full w-10 h-10 flex flex-col justify-center items-center space-y-1 cursor-pointer hover:bg-white/10 transition-colors"
            >
              <span className="w-4 h-[1px] bg-white rounded-full"></span>
              <span className="w-4 h-[1px] bg-white rounded-full"></span>
              <span className="w-4 h-[1px] bg-white rounded-full"></span>
            </button>
          </div>
        </div>
      </motion.nav>

      {menuOpen && <MenuOverlay onClose={() => setMenuOpen(false)} align={variant} />}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  );
}
