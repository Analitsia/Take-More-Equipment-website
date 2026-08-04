"use client";

import { motion } from "framer-motion";
import Subheading from "./Subheading";
import { CATEGORIES, categoryMeta, countByCategory } from "@/data/filters";
import type { Category } from "@/data/equipment";

/**
 * Browse strip above the catalogue. Selecting a tile drives the catalogue's
 * category filter rather than navigating — same card language as Benefits.
 */
export default function Categories({
  selected,
  onSelect,
}: {
  selected: Category[];
  onSelect: (category: Category) => void;
}) {
  return (
    <section className="pt-12 pb-4 px-6 md:px-12 w-full max-w-[1440px] mx-auto">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <Subheading text="Shop By Category" />
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight">
            Everything Behind The Pass
          </h2>
        </div>
        <p className="text-muted font-light text-sm leading-relaxed max-w-sm">
          Stock rotates weekly. If a category is thin this week, tell us what you need and
          we will watch for it at the next auction.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6">
        {CATEGORIES.map((category, idx) => {
          const active = selected.includes(category);
          return (
            <motion.button
              key={category}
              type="button"
              onClick={() => onSelect(category)}
              aria-pressed={active}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (idx % 6) * 0.06 }}
              className={`bg-card rounded-[2rem] p-6 border transition-colors group flex flex-col text-left ${
                active ? "border-accent/60" : "border-border hover:border-white/10"
              }`}
            >
              <div className="flex items-start justify-between mb-6">
                <div
                  className={`w-12 h-12 rounded-2xl bg-background border flex items-center justify-center text-accent group-hover:scale-110 transition-transform ${
                    active ? "border-accent/40" : "border-border"
                  }`}
                >
                  <iconify-icon
                    icon={categoryMeta[category].icon}
                    width="22"
                    height="22"
                  ></iconify-icon>
                </div>
                <span className="text-xs font-light text-muted pt-1">
                  {countByCategory(category)}
                </span>
              </div>
              <h3 className="text-base font-medium tracking-tight mb-1">{category}</h3>
              <p className="text-muted font-light text-xs leading-relaxed">
                {categoryMeta[category].blurb}
              </p>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
