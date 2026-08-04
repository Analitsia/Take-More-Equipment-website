"use client";

import { motion } from "framer-motion";

// Navbar Component
export default function Navbar() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="absolute top-4 inset-x-0 z-50 flex items-center justify-between px-4 md:px-8 w-full max-w-[1440px] mx-auto"
    >
      <div className="flex items-center space-x-2 cursor-pointer">
        <span className="tracking-tighter font-medium text-lg uppercase">Take More</span>
      </div>

      <div className="hidden md:flex glass-panel rounded-full px-6 py-2.5 items-center space-x-12">
        <a
          href="#stock"
          className="flex items-center space-x-2 cursor-pointer hover:text-white/70 transition-colors text-sm font-light"
        >
          <span>Stock</span>
          <iconify-icon icon="solar:alt-arrow-down-linear" width="16" height="16"></iconify-icon>
        </a>
        <div className="text-white/20">|</div>
        <div className="flex items-center space-x-4">
          <iconify-icon
            icon="solar:minimalistic-magnifer-linear"
            width="18"
            height="18"
            className="text-white/50 hover:text-white cursor-pointer transition-colors"
          ></iconify-icon>
          <iconify-icon
            icon="solar:user-linear"
            width="18"
            height="18"
            className="text-white/50 hover:text-white cursor-pointer transition-colors"
          ></iconify-icon>
        </div>
      </div>

      <div className="glass-panel rounded-full w-10 h-10 flex flex-col justify-center items-center space-y-1 cursor-pointer hover:bg-white/10 transition-colors">
        <div className="w-4 h-[1px] bg-white rounded-full"></div>
        <div className="w-4 h-[1px] bg-white rounded-full"></div>
        <div className="w-4 h-[1px] bg-white rounded-full"></div>
      </div>
    </motion.nav>
  );
}
