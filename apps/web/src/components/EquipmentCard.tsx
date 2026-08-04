"use client";

import { motion } from "framer-motion";
import { rands, type Equipment } from "@/data/equipment";

/**
 * The stock card. Structurally identical to the template's CarCard — same
 * dimensions, same glass panel, same hover behaviour — with rental specs
 * swapped for the three things a buyer of used kitchen kit actually checks:
 * capacity, power draw, and condition grade.
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
}: Equipment) {
  const saving = retailPrice
    ? Math.round(((retailPrice - price) / retailPrice) * 100)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      className="min-w-[320px] md:min-w-[400px] w-full md:w-[400px] h-[520px] relative rounded-[2rem] overflow-hidden group cursor-pointer shrink-0 snap-center"
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

      <div className="absolute bottom-6 left-6 right-6 z-10 flex flex-col">
        <h3 className="text-3xl font-medium tracking-tight mb-4">{title}</h3>

        <div className="glass-panel bg-card/80 rounded-2xl p-4 flex flex-col gap-3 border-none">
          <div className="flex justify-between items-center pb-3 border-b border-white/5">
            <div className="flex flex-col">
              <span className="text-xs text-muted font-light">
                {sold ? "Sold for" : "Our price"}
              </span>
              {retailPrice && (
                <span className="text-[11px] text-muted font-light line-through">
                  {rands(retailPrice)} new
                </span>
              )}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-lg font-medium tracking-tight">{rands(price)}</span>
              {saving !== null && (
                <span className="text-[11px] text-accent font-light">Save {saving}%</span>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center text-xs font-light text-white/80">
            <div className="flex items-center gap-1.5">
              <iconify-icon icon="solar:widget-linear" className="text-muted"></iconify-icon>
              {capacity}
            </div>
            <div className="flex items-center gap-1.5">
              <iconify-icon icon="solar:bolt-linear" className="text-muted"></iconify-icon>
              {power}
            </div>
            <div className="flex items-center gap-1.5">
              <iconify-icon
                icon="solar:verified-check-linear"
                className="text-muted"
              ></iconify-icon>
              Grade {grade}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
