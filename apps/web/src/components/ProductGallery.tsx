"use client";

import { useCallback, useEffect, useState } from "react";
import type { GalleryMedia } from "@/data/equipment";

/** How long a photo holds before the gallery moves on. */
const PHOTO_MS = 2000;

/**
 * The detail-page gallery: a self-running carousel of photos that finishes on
 * the walkaround clip.
 *
 * Two different clocks drive it, which is the whole trick. A photo advances on a
 * timer; the video advances on its own `ended` event, so it is never cut off
 * part-way through however long it runs. When it finishes the cycle wraps back
 * to the first photo and starts again.
 *
 * Only the active slot is mounted. That is what stops a clip playing on over the
 * top of the photos after the carousel has moved past it, and it also means the
 * video restarts from zero on every lap for free — coming back around remounts
 * the element rather than resuming a stale one.
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
  const [hovering, setHovering] = useState(false);
  const current = media[active];

  const advance = useCallback(() => {
    setActive((index) => (index + 1) % media.length);
  }, [media.length]);

  useEffect(() => {
    // The video is not on this clock — it calls advance() from onEnded instead.
    if (media.length < 2 || hovering || current?.kind !== "photo") return;
    const timer = setTimeout(advance, PHOTO_MS);
    return () => clearTimeout(timer);
  }, [active, hovering, current?.kind, media.length, advance]);

  return (
    <div
      className="flex flex-col gap-4"
      // Holding the pointer over the gallery stops the photo timer, so a buyer
      // can actually study the machine they are about to spend money on. Touch
      // devices have no hover, so on a phone it runs uninterrupted.
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="relative w-full aspect-[4/3] rounded-[2rem] overflow-hidden bg-card border border-border">
        {current?.kind === "video" ? (
          // Muted is not a style choice — an unmuted video is not allowed to
          // autoplay, and this one has to start without anyone tapping it. The
          // controls stay so a buyer can turn the sound on and hear it run.
          //
          // `contain`, not `cover`: these are filmed on a phone in a workshop
          // and are as often portrait as landscape, and cropping a walkaround
          // to a 4:3 box throws away the machine.
          <video
            key={current.url}
            src={current.url}
            autoPlay
            muted
            controls
            playsInline
            preload="auto"
            // Only reachable when a clip is the sole slot, which the publish
            // gate's "at least one photo" rule makes unlikely — but without it
            // that item would freeze on a finished video forever.
            loop={media.length < 2}
            onEnded={advance}
            // A file that will not decode must not strand the carousel on a
            // black rectangle for the rest of the visit.
            onError={advance}
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
