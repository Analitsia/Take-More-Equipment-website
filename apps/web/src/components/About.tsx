"use client";

import { motion } from "framer-motion";
import Subheading from "./Subheading";
import Stats from "./Stats";
import { claims, isVerified } from "@/data/launch";

// About Section
export default function About() {
  /**
   * The four numbers were hardcoded here and again on /about, unverified in
   * both places. They now come from the launch manifest and only appear once
   * somebody has stood behind them.
   *
   * The layout has to cope with none of them being ready. The stats are the
   * right half of a two-column row, so when there is nothing to put there the
   * left column must also stop being half-width — otherwise the copy sits in
   * half a page beside dead space, which looks like a bug rather than a choice.
   */
  const facts = [claims.machinesRebuilt, claims.averageSaving, claims.warranty, claims.delivery];
  const anyStats = facts.some(isVerified);

  return (
    <section className="py-14 md:py-24 lg:py-32 px-6 md:px-12 w-full max-w-[1440px] mx-auto">
      <div className="flex flex-col lg:flex-row justify-between gap-16 lg:gap-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          className={anyStats ? "lg:w-1/2" : "max-w-3xl"}
        >
          <Subheading text="About Us" />
          <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight leading-tight mb-8 max-w-2xl">
            The kitchen you wanted, at the number you actually budgeted.
          </h2>
          <div className="flex items-center space-x-6 border-b border-white/10 pb-8 max-w-md">
            <p className="text-muted font-light text-sm leading-relaxed">
              Every unit is stripped, rebuilt and load-tested in our Montague Gardens
              workshop, then photographed as the one-of-one machine it is. What you see
              listed is exactly what is standing on our floor, at the price on the card.
            </p>
          </div>
          <a href="#process" className="inline-flex items-center space-x-4 mt-8 group">
            <span className="text-lg font-light group-hover:text-accent transition-colors">
              Our Process
            </span>
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-background group-hover:scale-105 transition-transform">
              <iconify-icon icon="solar:arrow-right-linear" width="20" height="20"></iconify-icon>
            </div>
          </a>
        </motion.div>

        {anyStats && (
          <div className="lg:w-1/2">
            <Stats facts={facts} animate />
          </div>
        )}
      </div>
    </section>
  );
}
