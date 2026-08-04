"use client";

import { motion } from "framer-motion";
import Subheading from "./Subheading";
import { site, whatsappLink } from "@/data/site";

// Closing CTA — Phase 1 sells by enquiry, so this is the primary conversion point.
export default function CtaBand() {
  return (
    <section className="py-12 md:py-14 md:py-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        className="relative bg-card rounded-[2rem] border border-border p-6 sm:p-8 md:p-16 overflow-hidden"
      >
        <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/3 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="relative flex flex-col lg:flex-row justify-between lg:items-end gap-10">
          <div className="max-w-2xl">
            <Subheading text="Looking For Something Specific?" />
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight leading-tight mb-6">
              Most of our stock sells before it reaches this page.
            </h2>
            <p className="text-muted font-light text-sm leading-relaxed max-w-lg">
              Tell us the machine and your budget. If we do not have it this week, we watch
              for it at the next auction and send you photos before it is listed publicly.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 shrink-0">
            <a
              href={whatsappLink(
                "Hi Take More, I'm looking for the following equipment:"
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-4 group"
            >
              <span className="text-lg font-light group-hover:text-accent transition-colors">
                WhatsApp Us
              </span>
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-background group-hover:scale-105 transition-transform">
                <iconify-icon icon="solar:chat-round-line-linear" width="20" height="20"></iconify-icon>
              </div>
            </a>
            <div className="hidden sm:block w-[1px] h-8 bg-white/10"></div>
            <a
              href={`tel:${site.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center space-x-4 group"
            >
              <span className="text-lg font-light group-hover:text-accent transition-colors">
                {site.phone}
              </span>
              <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
                <iconify-icon icon="solar:phone-linear" width="20" height="20"></iconify-icon>
              </div>
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
