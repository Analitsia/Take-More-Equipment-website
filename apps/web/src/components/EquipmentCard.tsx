"use client";

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
  title,
  brand,
  image,
  price,
  retailPrice,
  grade,
  capacity,
  power,
  sold,
  variant = "carousel",
}: Equipment & { variant?: "carousel" | "grid" }) {
  const saving = retailPrice
    ? Math.round(((retailPrice - price) / retailPrice) * 100)
    : null;

  const grid = variant === "grid";
  const sizing = grid
    ? "w-full h-[440px]"
    : "min-w-[320px] md:min-w-[400px] w-full md:w-[400px] h-[520px] shrink-0 snap-center";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      className={`${sizing} relative rounded-[2rem] overflow-hidden group cursor-pointer`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt={`${brand} ${title}`}
        className={`absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out ${
          sold ? "grayscale-[0.6]" : ""
        }`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent"></div>

      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-10">
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
          grid ? "bottom-5 left-5 right-5" : "bottom-6 left-6 right-6"
        }`}
      >
        <h3
          className={`font-medium tracking-tight ${
            grid ? "text-2xl mb-3" : "text-3xl mb-4"
          }`}
        >
          {title}
        </h3>

        <div
          className={`glass-panel bg-card/80 rounded-2xl flex flex-col border-none ${
            grid ? "p-3.5 gap-2.5" : "p-4 gap-3"
          }`}
        >
          <div
            className={`flex justify-between items-center gap-2 border-b border-white/5 ${
              grid ? "pb-2.5" : "pb-3"
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
                  grid ? "text-base" : "text-lg"
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
            className={`flex justify-between items-center font-light text-white/80 gap-1.5 ${
              grid ? "text-[10px]" : "text-xs"
            }`}
          >
            <div className="flex items-center gap-1 min-w-0">
              <iconify-icon icon="solar:widget-linear" className="text-muted shrink-0"></iconify-icon>
              <span className="truncate">{capacity}</span>
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <iconify-icon icon="solar:bolt-linear" className="text-muted shrink-0"></iconify-icon>
              <span className="truncate">{power}</span>
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
