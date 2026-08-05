"use client";

import { motion } from "framer-motion";
import Subheading from "./Subheading";

// Process Section — the story that justifies the price.
export default function Process() {
  const steps = [
    {
      icon: "solar:tag-price-linear",
      title: "You pay for the machine",
      copy: "Most of a new price is freight, import duty, distributor margin and a showroom floor. None of that is the machine. We run a workshop instead of a showroom, so that is what you pay for.",
    },
    {
      icon: "solar:settings-linear",
      title: "We rebuild it",
      copy: "Seals, elements, thermostats, bearings, castors — anything worn gets replaced on the bench. Not wiped down and resold. Rebuilt, with the parts list published on the listing.",
    },
    {
      icon: "solar:checklist-minimalistic-linear",
      title: "We test and grade it",
      copy: "Every unit runs a full service cycle under load before it gets a price, then an honest A, B or C for looks only, photographed as-is. Scratches included.",
    },
    {
      icon: "solar:delivery-linear",
      title: "You see it run, then it ships",
      copy: "Watch it complete a cycle in Montague Gardens before you pay, or we deliver, place and level it in your kitchen within 48 hours.",
    },
  ];

  return (
    <section
      id="process"
      className="py-14 md:py-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto relative scroll-mt-24"
    >
      <div className="text-center mb-10 md:mb-16 flex flex-col items-center">
        <Subheading text="How It Works" />
        <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight max-w-3xl leading-tight">
          Why We Can Sell A R98 000 Combi For R42 500
        </h2>
        {/* The three-way frame: the two alternatives a buyer is actually weighing,
            and why the third one is the only one that gives them both halves. */}
        <p className="text-muted font-light text-sm leading-relaxed max-w-2xl mt-5 md:mt-6">
          There are two normal ways to equip a kitchen. Pay retail for new and spend your
          whole budget on three machines. Or gamble on a private sale and hope it lasts
          past opening week. We are the third: the price of the second, with the machine
          rebuilt, tested and guaranteed like the first.
        </p>
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
              <span className="text-4xl sm:text-5xl font-light tracking-tighter text-white/15">
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
