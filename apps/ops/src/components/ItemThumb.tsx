"use client";

import { useState } from "react";
import { coverImage, coverVideo, mediaUrl, type MediaRef } from "@/lib/media";

/**
 * The face of a machine in a list — its first photograph, standing in for it
 * the way a profile picture stands in for a person.
 *
 * One component for every list rather than the same twenty lines copied into
 * each, because the interesting part is not the markup: it is the three ways
 * this can have nothing to show, and the fact that they do not look the same.
 *
 *   1. No media at all → the camera icon. Nothing has been photographed yet,
 *      and the icon is an invitation to go and do it.
 *   2. Only clips → the first frame of the first clip, muted and unplayable.
 *      An item with a video is not an item with no pictures, and painting the
 *      camera icon over one would say it was. Same trick MediaManager uses.
 *   3. A photograph whose URL will not load → the camera icon again, NOT the
 *      browser's broken-image glyph. A thumbnail that fails loudly in the
 *      middle of a list reads as "this app is broken"; the icon reads as "no
 *      picture", which is what the person looking at it can actually act on.
 *
 * The zoom on hover is the caller's business — pass it through `imageClassName`
 * alongside a `group` on the card — so a list that does not want one does not
 * get one.
 */
export default function ItemThumb({
  media,
  className,
  imageClassName = "",
  icon = 18,
}: {
  media: readonly MediaRef[] | null | undefined;
  /** Size and corner radius. The frame, border and clipping are set here. */
  className: string;
  /** Applied to the picture itself — hover motion lives here. */
  imageClassName?: string;
  icon?: number;
}) {
  const image = coverImage(media);
  // The failed URL, not a boolean: a refresh that swaps in a different
  // photograph has to get a fresh attempt rather than inherit this one's
  // failure, and comparing the src is what makes that automatic.
  const [failed, setFailed] = useState<string | null>(null);

  const photo = image && image !== failed ? image : null;
  const clip = photo ? null : coverVideo(media);
  const clipUrl = clip ? mediaUrl(clip) : null;

  return (
    <div className={`overflow-hidden bg-background border border-border shrink-0 ${className}`}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          loading="lazy"
          onError={() => setFailed(photo)}
          className={`w-full h-full object-cover ${imageClassName}`}
        />
      ) : clipUrl ? (
        <div className="relative w-full h-full">
          {/* `#t=0.1` with preload="metadata" paints the first frame without
              fetching the whole clip. */}
          <video
            src={`${clipUrl}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            className={`w-full h-full object-cover ${imageClassName}`}
          />
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-5 h-5 rounded-full bg-background/70 border border-border flex items-center justify-center text-white">
              <iconify-icon icon="solar:play-bold" width="9" height="9" noobserver="" />
            </span>
          </span>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted">
          <iconify-icon icon="solar:camera-linear" width={icon} height={icon} noobserver="" />
        </div>
      )}
    </div>
  );
}
