"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import MenuOverlay from "./MenuOverlay";
import SearchOverlay from "./SearchOverlay";

/**
 * Navbar Component
 *
 * `overlay` floats it over the hero exactly as the template did. `solid` pins
 * it to the top of an inner page, where there is no hero behind it.
 */
export default function Navbar({
  variant = "overlay",
}: {
  variant?: "overlay" | "solid";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const position =
    variant === "overlay"
      ? "absolute top-4 inset-x-0 z-50"
      : "sticky top-0 z-50 py-4 bg-background/80 backdrop-blur-md";

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className={`${position} flex items-center justify-between px-4 md:px-8 w-full max-w-[1440px] mx-auto`}
      >
        <Link href="/" className="flex items-center space-x-2 cursor-pointer">
          <span className="tracking-tighter font-medium text-lg uppercase">Take More</span>
        </Link>

        <div className="hidden md:flex glass-panel rounded-full px-6 py-2.5 items-center space-x-12">
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
      </motion.nav>

      {menuOpen && <MenuOverlay onClose={() => setMenuOpen(false)} />}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  );
}
