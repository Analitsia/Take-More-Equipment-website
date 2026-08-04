"use client";

import { motion } from "framer-motion";
import Subheading from "./Subheading";
import { categories } from "@/data/equipment";

// Categories Section — same card language as Benefits.
export default function Categories() {
  return (
    <section className="py-24 px-6 md:px-12 max-w-[1440px] mx-auto">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <Subheading text="Shop By Category" />
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight">
            Everything Behind The Pass
          </h2>
        </div>
        <p className="text-muted font-light text-sm leading-relaxed max-w-sm">
          Stock rotates weekly. If a category is thin this week, tell us what you need and we
          will watch for it at the next auction.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((category, idx) => (
          <motion.a
            key={category.name}
            href="#stock"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: (idx % 3) * 0.1 }}
            className="bg-card rounded-[2rem] p-8 border border-border hover:border-white/10 transition-colors group flex flex-col"
          >
            <div className="flex items-start justify-between mb-8">
              <div className="w-14 h-14 rounded-2xl bg-background border border-border flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                <iconify-icon icon={category.icon} width="24" height="24"></iconify-icon>
              </div>
              <span className="text-xs font-light text-muted pt-2">
                {category.count} in stock
              </span>
            </div>
            <h3 className="text-xl font-medium tracking-tight mb-2">{category.name}</h3>
            <p className="text-muted font-light text-sm leading-relaxed mb-6">
              {category.blurb}
            </p>
            <div className="mt-auto flex items-center space-x-3 text-sm font-light group-hover:text-accent transition-colors">
              <span>View stock</span>
              <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
            </div>
          </motion.a>
        ))}
      </div>
    </section>
  );
}
