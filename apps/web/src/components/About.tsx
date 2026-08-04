"use client";

import { motion } from "framer-motion";
import Subheading from "./Subheading";

// About Section
export default function About() {
  const stats = [
    { number: "600", suffix: "+", label: "Machines Restored" },
    { number: "50", suffix: "%", label: "Average Saving vs New" },
    { number: "6", suffix: "Mo", label: "Workshop Warranty" },
    { number: "48", suffix: "H", label: "Cape Town Delivery" },
  ];

  return (
    <section className="py-14 md:py-24 lg:py-32 px-6 md:px-12 w-full max-w-[1440px] mx-auto">
      <div className="flex flex-col lg:flex-row justify-between gap-16 lg:gap-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          className="lg:w-1/2"
        >
          <Subheading text="About Us" />
          <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight leading-tight mb-8 max-w-2xl">
            We buy the kitchens that close, and rebuild them for the kitchens that are
            opening.
          </h2>
          <div className="flex items-center space-x-6 border-b border-white/10 pb-8 max-w-md">
            <p className="text-muted font-light text-sm leading-relaxed">
              Every unit lands in our Montague Gardens workshop, gets stripped, serviced and
              load-tested, then photographed as the one-of-one machine it is. What you see
              listed is exactly what is standing on our floor.
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

        <div className="lg:w-1/2 grid grid-cols-2 gap-y-12 gap-x-8">
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="flex flex-col"
            >
              <div className="flex items-end mb-2">
                <span className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tighter">
                  {stat.number}
                </span>
                <span className="text-accent text-3xl sm:text-4xl md:text-5xl font-light tracking-tighter mb-1 ml-1">
                  {stat.suffix}
                </span>
              </div>
              <span className="text-muted font-light text-sm">{stat.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
