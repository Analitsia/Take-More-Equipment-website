"use client";

import { motion } from "framer-motion";
import Subheading from "./Subheading";

// Process Section — the story that justifies the price.
export default function Process() {
  const steps = [
    {
      icon: "solar:hand-money-linear",
      title: "We buy at auction",
      copy: "Restaurants close every week in the Western Cape. We are in the room when their kitchens go under the hammer, paying cash and buying whole lines at a time.",
    },
    {
      icon: "solar:settings-linear",
      title: "We rebuild it",
      copy: "Seals, elements, thermostats, bearings, castors — anything worn gets replaced in our workshop. Not wiped down and resold. Rebuilt.",
    },
    {
      icon: "solar:checklist-minimalistic-linear",
      title: "We test and grade it",
      copy: "Every unit runs a full service cycle under load, then gets an honest A, B or C grade and photographed as-is. Scratches included.",
    },
    {
      icon: "solar:delivery-linear",
      title: "You collect or we deliver",
      copy: "Collect from Montague Gardens, or we quote delivery and place it in your kitchen. Small items ship nationwide by courier.",
    },
  ];

  return (
    <section
      id="process"
      className="py-24 px-6 md:px-12 max-w-[1440px] mx-auto relative scroll-mt-24"
    >
      <div className="text-center mb-16 flex flex-col items-center">
        <Subheading text="How It Works" />
        <h2 className="text-3xl md:text-5xl font-medium tracking-tight max-w-3xl leading-tight">
          Why We Can Sell A R98 000 Combi For R42 500
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {steps.map((step, idx) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1 }}
            className="border-t border-border pt-8 flex flex-col"
          >
            <div className="flex items-center justify-between mb-8">
              <span className="text-5xl font-light tracking-tighter text-white/15">
                0{idx + 1}
              </span>
              <div className="w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center text-accent">
                <iconify-icon icon={step.icon} width="22" height="22"></iconify-icon>
              </div>
            </div>
            <h3 className="text-xl font-medium tracking-tight mb-3">{step.title}</h3>
            <p className="text-muted font-light text-sm leading-relaxed">{step.copy}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
