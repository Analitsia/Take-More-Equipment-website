"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { rands, type Equipment } from "@/data/equipment";

/**
 * The stock card. Structurally identical to the template's CarCard — same
 * glass panel, same hover behaviour — with rental specs swapped for the three
 * things a buyer of used kitchen kit actually checks: capacity, power draw,
 * and condition grade.
 *
 * `carousel` keeps the template's fixed-width, snap-scrolling behaviour for the
 * highlighted row. `grid` lets the card fill its grid column instead. Only the
 * sizing classes differ — everything inside is shared.
 */
export default function EquipmentCard({
  slug,
  title,
  brand,
  images,
  price,
  retailPrice,
  grade,
  capacity,
  power,
  sold,
  variant = "carousel",
  decorative = false,
}: Equipment & { variant?: "carousel" | "grid"; decorative?: boolean }) {
  const image = images[0];
  const saving = retailPrice
    ? Math.round(((retailPrice - price) / retailPrice) * 100)
    : null;

  const grid = variant === "grid";
  // Carousel cards are viewport-relative on mobile so several are in play at
  // once while the row drifts, and the card never runs under the screen edge.
  // The mobile max-width has to be lifted again from sm up, or it would also
  // cap the wider desktop card.
  const sizing = grid
    ? "w-full h-[340px] sm:h-[400px] xl:h-[440px]"
    : "w-[62vw] max-w-[320px] sm:w-[272px] sm:max-w-none md:w-[400px] h-[304px] sm:h-[352px] md:h-[520px] shrink-0";

  // Nothing on a travelling card may sit inside its own clip. `truncate` is
  // `overflow: hidden`, and a clip on a card that is being re-rasterised at the
  // edge of the screen gets snapped to whole device pixels, so the text inside
  // it lands somewhere slightly different each time the card is redrawn — the
  // label appears to dash sideways. The one spec label with no clip, "Grade A",
  // was also the one that never moved. So carousel labels are all sized to
  // their own content, like that one, and the row wraps to a second line on the
  // narrowest phones instead of ellipsising. Static grid cards keep truncation:
  // they never move, and their columns are tighter.
  const specItem = grid
    ? "flex items-center gap-1 min-w-0"
    : "flex items-center gap-1 shrink-0";
  const specText = grid ? "truncate" : "whitespace-nowrap";

  // Carousel cards get no entrance animation of their own: the row they sit in
  // is already moving, and a per-card opacity/scale tween on top of that reads
  // as the card lagging behind its neighbours. Grid cards still fade in.
  const enter = grid
    ? {
        initial: { opacity: 0, scale: 0.95 },
        whileInView: { opacity: 1, scale: 1 },
        viewport: { once: true, margin: "-50px" },
      }
    : {};

  return (
    <motion.div
      data-card="stock"
      {...enter}
      className={`${sizing} relative rounded-[2rem] overflow-hidden group ${
        grid ? "" : "moving-card"
      }`}
    >
      <Link
        href={`/stock/${slug}`}
        aria-label={`${brand} ${title}`}
        className="absolute inset-0 z-20"
        tabIndex={decorative ? -1 : undefined}
        aria-hidden={decorative || undefined}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt={`${brand} ${title}`}
        className={`absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out ${
          sold ? "grayscale-[0.6]" : ""
        }`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent"></div>

      <div className="absolute top-4 left-4 right-4 md:top-6 md:left-6 md:right-6 flex justify-between items-center z-10">
        <span className="glass-panel px-4 py-1.5 rounded-full text-xs font-medium tracking-widest uppercase">
          {brand}
        </span>
        {sold ? (
          <span className="px-4 py-1.5 rounded-full bg-accent text-background text-xs font-medium tracking-widest uppercase">
            Sold
          </span>
        ) : (
          <div className="w-8 h-8 rounded-full glass-panel flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <iconify-icon icon="solar:arrow-right-up-linear" width="16" height="16"></iconify-icon>
          </div>
        )}
      </div>

      <div
        className={`absolute z-10 flex flex-col ${
          grid ? "bottom-4 left-4 right-4 sm:bottom-5 sm:left-5 sm:right-5" : "bottom-4 left-4 right-4 md:bottom-6 md:left-6 md:right-6"
        }`}
      >
        <h3
          className={`font-medium tracking-tight ${
            grid ? "text-xl sm:text-2xl mb-3" : "text-xl sm:text-2xl md:text-3xl mb-2.5 md:mb-4"
          }`}
        >
          {title}
        </h3>

        <div
          className={`glass-panel panel-solid bg-card/80 rounded-2xl flex flex-col border-none ${
            grid ? "p-3.5 gap-2.5" : "p-3 gap-2 md:p-4 md:gap-3"
          }`}
        >
          <div
            className={`flex justify-between items-center gap-2 border-b border-white/5 ${
              grid ? "pb-2.5" : "pb-2 md:pb-3"
            }`}
          >
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-muted font-light whitespace-nowrap">
                {sold ? "Sold for" : "Our price"}
              </span>
              {retailPrice && (
                <span className="text-[11px] text-muted font-light line-through whitespace-nowrap">
                  {rands(retailPrice)}
                  {grid ? "" : " new"}
                </span>
              )}
            </div>
            <div className="flex flex-col items-end min-w-0">
              <span
                className={`font-medium tracking-tight whitespace-nowrap ${
                  grid ? "text-base" : "text-base md:text-lg"
                }`}
              >
                {rands(price)}
              </span>
              {saving !== null && (
                <span className="text-[11px] text-accent font-light whitespace-nowrap">
                  Save {saving}%
                </span>
              )}
            </div>
          </div>
          <div
            className={`flex justify-between items-center font-light text-white/80 gap-x-1.5 gap-y-1 ${
              grid ? "text-[10px]" : "flex-wrap text-[10px] md:text-xs"
            }`}
          >
            <div className={specItem}>
              <iconify-icon icon="solar:widget-linear" className="text-muted shrink-0"></iconify-icon>
              <span className={specText}>{capacity}</span>
            </div>
            <div className={specItem}>
              <iconify-icon icon="solar:bolt-linear" className="text-muted shrink-0"></iconify-icon>
              <span className={specText}>{power}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <iconify-icon
                icon="solar:verified-check-linear"
                className="text-muted shrink-0"
              ></iconify-icon>
              <span className="whitespace-nowrap">Grade {grade}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
