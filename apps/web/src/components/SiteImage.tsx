import type { Fact, Media } from "@/data/launch";
import { launchState, publishedValue } from "@/data/launch";

/**
 * A photograph of this business, or a deliberate-looking absence of one.
 *
 * The hero and the workshop shot cannot degrade to nothing — the hero *is* the
 * top of the page, and a missing panel on /about leaves a hole beside a column
 * of text. So this keeps the box exactly the same size either way and swaps the
 * photograph for a flat surface carrying the site's own texture.
 *
 * WHICH ONE YOU GET turns on `launchState`, the same switch the contact gate
 * reads — because withholding has two different costs on either side of it:
 *
 *   · pre-launch — the mockup photograph renders. It is stock imagery and it is
 *     not this workshop, which is precisely why it must not survive cutover.
 *     But the only people looking at the site today are the ones building it,
 *     and to them a hero with no photograph in it reads as a broken page rather
 *     than as a principled blank.
 *   · live — unverified photography is withheld and the textured surface takes
 *     its place, so a stock kitchen is never implied to be ours in front of a
 *     customer.
 *
 * Verified photography renders in both. Filling in `media` in the manifest is
 * what makes this distinction stop mattering.
 *
 * The stand-in works because the compositions already survive it. The hero's scrim is
 * `from-background/70 via-background/50 to-background/95`; over a flat card
 * colour that reads as an intentional dark hero rather than a failed image. The
 * caption under the /about panel still says what the picture would have shown.
 *
 * Deliberately a plain <img>, matching what it replaces. These are decorative
 * full-bleed photographs, not catalogue images, and routing them through
 * next/image would mean a remotePatterns entry for whichever host the real
 * photography ends up on — which is the machinery the launch gate exists to
 * keep honest. When real photography lands in Supabase Storage it is served
 * through the same transform pipeline as item media.
 */
export default function SiteImage({
  fact,
  className,
  fallbackClassName,
}: {
  fact: Fact<Media>;
  /** Applied to the <img> when there is a real photograph. */
  className?: string;
  /** Applied to the stand-in surface. Must occupy the same box. */
  fallbackClassName?: string;
}) {
  const image = publishedValue(fact) ?? (launchState === "live" ? null : fact.value);

  if (!image) {
    return (
      <div
        aria-hidden="true"
        className={`bg-card ${fallbackClassName ?? className ?? ""}`}
        style={{
          // A faint diagonal weave, drawn in CSS. Enough texture that the panel
          // reads as a surface rather than as a failed image, faint enough that
          // the scrim and any text over it are unaffected.
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.022) 0px, rgba(255,255,255,0.022) 1px, transparent 1px, transparent 11px)",
        }}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.src} alt={image.alt} className={className} />;
}
