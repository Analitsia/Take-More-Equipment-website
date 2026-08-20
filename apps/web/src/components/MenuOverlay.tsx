"use client";

import { useEffect } from "react";
import Link from "next/link";
import useScrollLock from "@/hooks/useScrollLock";
import {
  headerRow,
  HEADER_TOP,
  OVERLAY_LOGO_FRAME_INSET,
  type HeaderVariant,
} from "./headerLayout";
import useCatalogueIndex from "@/hooks/useCatalogueIndex";
import { hasJournal } from "@/data/launch";
import { site, whatsappLink } from "@/data/site";

export const navLinks = [
  { href: "/#catalogue", label: "Stock", blurb: "Every unit priced on the card" },
  { href: "/conditions", label: "Condition & Warranty", blurb: "What A, B and C mean" },
  { href: "/delivery", label: "Delivery & Collection", blurb: "Lead times and costs" },
  { href: "/about", label: "About Us", blurb: "Why we cost half of new" },
  // Dropped entirely while no post has been verified, rather than offering a
  // prominent route to an empty page.
  ...(hasJournal
    ? [{ href: "/blog", label: "Journal", blurb: "Buying guides and notes" }]
    : []),
];

export default function MenuOverlay({
  onClose,
  align = "overlay",
}: {
  onClose: () => void;
  /** Which navbar variant opened this, so the header lands on that navbar's row. */
  align?: HeaderVariant;
}) {
  const index = useCatalogueIndex();
  useScrollLock();

  /**
   * The category list, split by line of business once there is more than one
   * carrying stock — the same rule the catalogue's own switcher follows, so a
   * visitor never meets a heading here that the shop below does not have.
   * A line with nothing published is dropped rather than listed at zero.
   */
  const categoryBlocks = (() => {
    const lines = (index?.divisions ?? []).filter((d) => d.count > 0);
    const categories = index?.categories ?? [];
    if (lines.length > 1) {
      return lines.map((line) => ({
        label: line.name,
        categories: categories.filter((c) => c.divisionSlug === line.slug),
      }));
    }
    return [
      {
        label: "Categories",
        categories: categories.filter((c) =>
          lines.some((line) => line.slug === c.divisionSlug)
        ),
      },
    ];
  })();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain hide-scrollbar lock-gutter"
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
    >
      {/* Fixed, not absolute: an absolute backdrop is laid out inside this
          scrolling box, so it scrolled away and left the page showing through
          below the first screenful. */}
      <div className="fixed inset-0 bg-background/95 backdrop-blur-md" aria-hidden />

      <div className={`relative min-h-full w-full ${HEADER_TOP[align]} pb-6 md:pb-8`}>
        {/* Same row as the navbar underneath, from the same source, so the logo
            and the round button hold their pixel while the menu opens. */}
        <div className={`${headerRow(align)} mb-10 md:mb-16`}>
          <Link
            href="/"
            onClick={onClose}
            aria-label="Take More Equipment — home"
            className={`flex items-center ${
              align === "overlay" ? OVERLAY_LOGO_FRAME_INSET : ""
            }`}
          >
            {/* Matches the navbar's logo box exactly — see headerLayout: any
                disagreement reads as the mark jumping when the menu opens. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/takemore-logo-horizontal.svg"
              alt="Take More Equipment"
              width={1013}
              height={190}
              className="h-8 sm:h-10 w-auto max-w-[60vw] object-contain object-left"
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="glass-panel rounded-full w-10 h-10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <iconify-icon icon="solar:close-circle-linear" width="18" height="18"></iconify-icon>
          </button>
        </div>

        <div className="w-full max-w-[1440px] mx-auto px-6 md:px-12 flex flex-col lg:flex-row gap-12 lg:gap-24 pb-12 md:pb-16">
          <nav className="flex-1">
            <div className="flex items-center space-x-3 mb-8">
              <div className="w-5 h-1 rounded-full bg-accent"></div>
              <span className="text-accent uppercase text-xs tracking-wider font-normal">
                Menu
              </span>
            </div>
            <ul className="flex flex-col">
              {navLinks.map((link) => (
                <li key={link.href} className="border-b border-border">
                  <Link
                    href={link.href}
                    onClick={onClose}
                    className="group flex items-baseline justify-between gap-6 py-4 md:py-5"
                  >
                    <span className="text-xl sm:text-2xl md:text-4xl font-medium tracking-tighter group-hover:text-accent transition-colors">
                      {link.label}
                    </span>
                    <span className="hidden sm:block text-xs font-light text-muted text-right shrink-0">
                      {link.blurb}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="lg:w-80 shrink-0 flex flex-col gap-10">
            {categoryBlocks.map((block) => (
            <div key={block.label}>
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-5 h-1 rounded-full bg-accent"></div>
                <span className="text-accent uppercase text-xs tracking-wider font-normal">
                  {block.label}
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {block.categories.map((category) => (
                  <li key={category.name}>
                    <Link
                      href="/#catalogue"
                      onClick={onClose}
                      className="group flex items-center justify-between gap-3 py-2"
                    >
                      <span className="flex items-center gap-3">
                        <iconify-icon
                          icon={category.icon}
                          width="16"
                          height="16"
                          className="text-accent"
                        ></iconify-icon>
                        <span className="text-sm font-light text-muted group-hover:text-white transition-colors">
                          {category.name}
                        </span>
                      </span>
                      <span className="text-xs font-light text-muted/60">
                        {category.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            ))}

            <div className="bg-card rounded-[2rem] border border-border p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-5 h-1 rounded-full bg-accent"></div>
                <span className="text-accent uppercase text-xs tracking-wider font-normal">
                  Get In Touch
                </span>
              </div>
              <a
                href={whatsappLink("Hi Take More, I'm looking for equipment for my kitchen.")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 group py-2"
              >
                <span className="text-sm font-light group-hover:text-accent transition-colors">
                  WhatsApp us
                </span>
                <iconify-icon
                  icon="solar:chat-round-line-linear"
                  width="16"
                  height="16"
                  className="text-accent"
                ></iconify-icon>
              </a>
              <a
                href={`tel:${site.phone.replace(/\s/g, "")}`}
                className="flex items-center justify-between gap-3 group py-2"
              >
                <span className="text-sm font-light group-hover:text-accent transition-colors">
                  {site.phone}
                </span>
                <iconify-icon
                  icon="solar:phone-linear"
                  width="16"
                  height="16"
                  className="text-accent"
                ></iconify-icon>
              </a>
              <p className="text-xs font-light text-muted leading-relaxed mt-4 pt-4 border-t border-border">
                {site.address}
                <br />
                {site.hours}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
