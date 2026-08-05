"use client";

import { motion } from "framer-motion";
import Navbar from "./Navbar";
import Subheading from "./Subheading";
import { site, whatsappLink } from "@/data/site";

// Hero Component
export default function Hero() {
  return (
    // On a phone the framed image was 85vh with the title pinned to its floor,
    // which left a screenful of empty photo between the city line and the
    // headline. Shorter image, same composition, far less dead space. Desktop
    // keeps its full 90vh.
    <div className="relative p-2 md:p-4 h-[58vh] min-h-[490px] md:h-[90vh] md:min-h-[520px]">
      <div className="w-full h-full rounded-[2rem] overflow-hidden relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1708915965975-2a950db0e215?q=80&w=2938&auto=format&fit=crop"
          alt="Refurbished commercial kitchen line"
          className="absolute inset-0 w-full h-full object-cover scale-105"
        />
        {/* Scrim is heavier than the source template's — that hero used an already-dark
            studio car shot, whereas kitchen interiors are lit and busy. */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background/95"></div>

        <div className="absolute top-20 md:top-32 inset-x-0 px-5 sm:px-6 md:px-12 flex justify-between items-start text-xs font-light text-white/70 z-10">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            {site.city}, {site.country}
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-right max-w-[200px] hidden md:block"
          >
            Rebuilt in our workshop.
            <br />
            Warrantied for six months.
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-right max-w-[250px] hidden lg:block"
          >
            Every machine is stripped, rebuilt and run under load before it earns a price
            on this page.
          </motion.div>
        </div>

        <div className="absolute bottom-0 inset-x-0 p-5 sm:p-6 md:p-12 z-20 flex flex-col lg:flex-row justify-between lg:items-end gap-5 md:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="max-w-2xl"
          >
            <Subheading text="Commercial Catering Equipment · Cape Town" />
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-medium tracking-tighter leading-[1.1] mb-4 md:mb-5">
              Restaurant-Grade Kit,
              <br />
              Half The Retail Price
            </h1>
            <p className="text-sm md:text-base font-light text-white/70 leading-relaxed max-w-lg mb-1">
              Rebuilt in our own workshop, tested under load, priced on the page and
              covered for six months. Standing on our floor today — not eight weeks away
              on a ship.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 border-t lg:border-t-0 lg:border-l border-white/10 pt-5 md:pt-6 lg:pt-0 lg:pl-12 w-full lg:w-auto"
          >
            <a
              href="#stock"
              className="group flex items-center space-x-3 text-lg font-light hover:text-accent transition-colors w-full sm:w-auto justify-between"
            >
              <span>Browse Stock</span>
              <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center group-hover:border-accent transition-colors">
                <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
              </div>
            </a>
            <div className="hidden sm:block w-[1px] h-8 bg-white/10"></div>
            <a
              href={whatsappLink("Hi Take More, I'm looking for equipment for my kitchen.")}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center space-x-3 text-lg font-light hover:text-accent transition-colors w-full sm:w-auto justify-between"
            >
              <span>WhatsApp Us</span>
              <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center group-hover:border-accent transition-colors">
                <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
              </div>
            </a>
          </motion.div>
        </div>
      </div>

      {/* Outside the framed image, not inside it: an absolute box is positioned
          against its ancestor's padding box, so out here the navbar's own
          padding is measured from the viewport edge — the same edge the menu
          overlay measures from. Inside the frame it was offset by the frame's
          own padding, and the logo slid by that much every time the menu
          opened. It still paints over the image; only its ruler changed. */}
      <Navbar />
    </div>
  );
}
