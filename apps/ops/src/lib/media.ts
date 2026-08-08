/**
 * Storage paths and public URLs for item media.
 *
 * The bucket is public, so URLs are stable and CDN-cached — which is what lets
 * the storefront render statically without signed URLs expiring underneath a
 * cached page.
 *
 * Transformations are applied per use rather than per upload: one original,
 * three sizes, no re-uploading when a card layout changes.
 */

const BUCKET = "item-media";

export const mediaBase = () =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

const renderBase = () =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public/${BUCKET}`;

export const SIZES = {
  /** Catalogue cards and ops thumbnails. */
  card: { width: 800, quality: 75 },
  /** The item detail gallery. */
  full: { width: 1600, quality: 80 },
  /** Open Graph — fixed dimensions, because social scrapers expect them. */
  og: { width: 1200, height: 630, quality: 80 },
} as const;

/**
 * A media row carries EITHER a storage path (real photography) or an external
 * URL (a placeholder from the mock catalogue). One function so no call site has
 * to remember that.
 */
export function mediaUrl(
  media: { kind?: string | null; storage_path?: string | null; external_url?: string | null },
  size: keyof typeof SIZES = "card"
): string | null {
  if (media.external_url) return media.external_url;
  if (!media.storage_path) return null;

  // Video skips the transformer entirely. `renderBase()` is the IMAGE endpoint —
  // it answers an mp4 with an error rather than a movie, and it would strip the
  // byte-range support a <video> needs to seek even if it did not.
  if (media.kind === "video") return `${mediaBase()}/${media.storage_path}`;

  const spec = SIZES[size];
  const params = new URLSearchParams({
    width: String(spec.width),
    quality: String(spec.quality),
    resize: "cover",
  });
  if ("height" in spec) params.set("height", String(spec.height));

  return `${renderBase()}/${media.storage_path}?${params}`;
}

/** items/<item_id>/<random>.<ext> — one prefix per machine. */
export function storagePathFor(itemId: string, file: File): string {
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  return `items/${itemId}/${id}.${ext}`;
}

export const isVideo = (file: File) => file.type.startsWith("video/");

/** Hard ceilings, matched to the bucket's own limit. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;
