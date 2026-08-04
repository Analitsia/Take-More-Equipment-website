"use client";

import { motion } from "framer-motion";
import Subheading from "./Subheading";

// Benefits Section
export default function Benefits() {
  const features = [
    {
      icon: "solar:tuning-2-linear",
      title: "Rebuilt, Not Just Wiped Down",
      copy: "Worn parts get replaced before a unit is ever listed, and we photograph what we swapped. You buy knowing exactly what was wrong with it and what we did about it.",
    },
    {
      icon: "solar:tag-price-linear",
      title: "40–60% Off Retail",
      copy: "The same brands specced into new kitchens, at auction-basis pricing. The budget that buys one new combi oven kits out most of a working line here.",
    },
    {
      icon: "solar:shield-check-linear",
      title: "6-Month Written Warranty",
      copy: "Parts and labour, in writing. If it fails inside six months we collect it, repair it and bring it back at our cost. Second-hand should not mean unprotected.",
    },
  ];

  return (
    // overflow-hidden keeps the decorative blur from widening the document on
    // narrow screens, which pushed every section under the right edge.
    <section className="py-14 md:py-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(600px,120vw)] h-[600px] bg-accent/5 rounded-full blur-[100px] -z-10"></div>

      <div className="text-center mb-10 md:mb-16 flex flex-col items-center">
        <Subheading text="Why Take More" />
        <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight max-w-2xl leading-tight">
          Second-Hand Price. First-Service Condition.
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.map((feature, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1 }}
            className="bg-card rounded-[2rem] p-6 sm:p-8 md:p-10 border border-border hover:border-white/10 transition-colors group"
          >
            <div className="w-14 h-14 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mb-8 group-hover:scale-110 transition-transform">
              <iconify-icon icon={feature.icon} width="24" height="24"></iconify-icon>
            </div>
            <h3 className="text-xl font-medium tracking-tight mb-4">{feature.title}</h3>
            <p className="text-muted font-light text-sm leading-relaxed">{feature.copy}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
