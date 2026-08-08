"use client";

import { motion } from "framer-motion";
import type { Fact, Stat } from "@/data/launch";
import { published } from "@/data/launch";

/**
 * The big-number row, rendering only the numbers somebody has verified.
 *
 * Extracted because the same four stats were duplicated verbatim in About.tsx
 * and on /about, so a corrected figure had to be corrected twice — exactly the
 * kind of drift the launch manifest exists to stop.
 *
 * Laid out with flex-wrap rather than a fixed grid. `grid-cols-2 lg:grid-cols-4`
 * leaves visibly empty cells when only one or two stats are verified, and
 * Tailwind cannot take a computed `lg:grid-cols-${n}` because the class has to
 * exist at build time. Wrapping items with a minimum width pack left and fill
 * the row at any count from one to four.
 */
export default function Stats({
  facts,
  animate = false,
}: {
  facts: Fact<Stat>[];
  animate?: boolean;
}) {
  const stats = published(facts);
  if (stats.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-y-12 gap-x-8">
      {stats.map((stat, idx) => {
        const body = (
          <>
            <div className="flex items-end mb-2">
              <span className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tighter">
                {stat.number}
              </span>
              <span className="text-accent text-3xl sm:text-4xl md:text-5xl font-light tracking-tighter mb-1 ml-1">
                {stat.suffix}
              </span>
            </div>
            <span className="text-muted font-light text-sm">{stat.label}</span>
          </>
        );

        // `min-w` + `flex-1` lets the container decide the count instead of a
        // breakpoint doing it: in the half-width column on the homepage four
        // stats wrap to 2×2, in the full-width row on /about the same four sit
        // in one line, and a single verified stat simply sits on the left.
        const className = "flex flex-col min-w-[140px] flex-1";

        return animate ? (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1 }}
            className={className}
          >
            {body}
          </motion.div>
        ) : (
          <div key={stat.label} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
