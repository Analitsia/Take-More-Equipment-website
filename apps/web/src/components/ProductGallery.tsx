"use client";

import { useState } from "react";

export default function ProductGallery({
  images,
  title,
  sold,
}: {
  images: string[];
  title: string;
  sold?: boolean;
}) {
  const [active, setActive] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full aspect-[4/3] rounded-[2rem] overflow-hidden bg-card border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[active]}
          alt={title}
          className={`w-full h-full object-cover ${sold ? "grayscale-[0.6]" : ""}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent pointer-events-none"></div>
        {sold && (
          <span className="absolute top-6 left-6 px-4 py-1.5 rounded-full bg-accent text-background text-xs font-medium tracking-widest uppercase">
            Sold
          </span>
        )}
      </div>

      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-3">
          {images.map((image, idx) => (
            <button
              key={image + idx}
              type="button"
              onClick={() => setActive(idx)}
              aria-label={`View photo ${idx + 1}`}
              aria-pressed={idx === active}
              className={`relative aspect-[4/3] rounded-2xl overflow-hidden border transition-colors ${
                idx === active
                  ? "border-accent/70"
                  : "border-border hover:border-white/20"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt=""
                className={`w-full h-full object-cover ${
                  idx === active ? "" : "opacity-60 hover:opacity-90 transition-opacity"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
