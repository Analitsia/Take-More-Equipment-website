"use client";

import { useState } from "react";
import type { GalleryMedia } from "@/data/equipment";

/**
 * The detail-page gallery: photos and video in one strip.
 *
 * Only the active slot is mounted, which is what stops a clip carrying on
 * playing after the visitor has clicked away to a photo — switching unmounts
 * the <video> and the sound goes with it.
 */
export default function ProductGallery({
  media,
  title,
  sold,
}: {
  media: GalleryMedia[];
  title: string;
  sold?: boolean;
}) {
  const [active, setActive] = useState(0);
  const current = media[active];

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full aspect-[4/3] rounded-[2rem] overflow-hidden bg-card border border-border">
        {current?.kind === "video" ? (
          // `contain`, not `cover`: these are filmed on a phone in a workshop
          // and are as often portrait as landscape, and cropping a walkaround
          // to a 4:3 box throws away the machine.
          <video
            key={current.url}
            src={current.url}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain bg-background"
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current?.url}
              alt={title}
              className={`w-full h-full object-cover ${sold ? "grayscale-[0.6]" : ""}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent pointer-events-none"></div>
          </>
        )}
        {sold && (
          <span className="absolute top-6 left-6 px-4 py-1.5 rounded-full bg-accent text-background text-xs font-medium tracking-widest uppercase">
            Sold
          </span>
        )}
      </div>

      {media.length > 1 && (
        <div className="grid grid-cols-4 gap-3">
          {media.map((slot, idx) => (
            <button
              key={slot.url + idx}
              type="button"
              onClick={() => setActive(idx)}
              aria-label={
                slot.kind === "video" ? `Play video ${idx + 1}` : `View photo ${idx + 1}`
              }
              aria-pressed={idx === active}
              className={`relative aspect-[4/3] rounded-2xl overflow-hidden border transition-colors ${
                idx === active ? "border-accent/70" : "border-border hover:border-white/20"
              }`}
            >
              {slot.kind === "video" ? (
                <>
                  {/* The `#t=0.1` fragment is what makes this a thumbnail: with
                      preload="metadata" the browser fetches just far enough to
                      paint that frame, so the tile shows the actual machine
                      rather than a black rectangle — and costs a few KB. */}
                  <video
                    src={`${slot.url}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                    tabIndex={-1}
                    aria-hidden="true"
                    className={`w-full h-full object-cover pointer-events-none ${
                      idx === active ? "" : "opacity-60"
                    }`}
                  />
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="w-8 h-8 rounded-full bg-background/70 border border-white/20 flex items-center justify-center text-white">
                      <iconify-icon icon="solar:play-bold" width="12" height="12" noobserver="" />
                    </span>
                  </span>
                </>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slot.url}
                    alt=""
                    className={`w-full h-full object-cover ${
                      idx === active ? "" : "opacity-60 hover:opacity-90 transition-opacity"
                    }`}
                  />
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
