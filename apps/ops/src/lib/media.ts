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
 * A media row as the list queries select it.
 *
 * `kind` and `position` are not decoration. Without `kind` a caller cannot tell
 * a clip from a photograph; without `position` it cannot tell which photograph
 * the workshop put first. Both are optional here only so that a query which
 * genuinely needs neither still type-checks.
 */
export type MediaRef = {
  kind?: string | null;
  storage_path?: string | null;
  external_url?: string | null;
  position?: number | null;
};

/**
 * A media row carries EITHER a storage path (real photography) or an external
 * URL (a placeholder from the mock catalogue). One function so no call site has
 * to remember that.
 */
export function mediaUrl(
  media: MediaRef,
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

/** The workshop's own order — the one MediaManager's arrows write. */
const byPosition = (media: readonly MediaRef[]): MediaRef[] =>
  [...media].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

/**
 * The photograph that stands for an item wherever it appears in a list.
 *
 * Deliberately NOT `media[0]`. Every list here used to take that, which was
 * wrong twice over. An embedded select comes back in no guaranteed order, so
 * "first" was not the first — reordering photos in the editor changed nothing
 * on the stock list. And when that arbitrary row happened to be a clip, its URL
 * still went to the image transformer, which answers an mp4 with
 * `400 InvalidRequest` — the broken thumbnail on the stock list, and on a
 * campaign a broken hero image in every recipient's inbox.
 *
 * So: order by position, then take the first thing that is actually a picture.
 */
export function coverPhoto(media: readonly MediaRef[] | null | undefined): MediaRef | null {
  if (!media?.length) return null;
  return byPosition(media).find((m) => m.kind !== "video") ?? null;
}

/** The cover photo's URL, or null when an item has no photograph at all. */
export function coverImage(
  media: readonly MediaRef[] | null | undefined,
  size: keyof typeof SIZES = "card"
): string | null {
  const photo = coverPhoto(media);
  return photo ? mediaUrl(photo, size) : null;
}

/**
 * The first clip, for a thumbnail that would otherwise be an empty icon.
 *
 * Only ever a fallback: a still frame is a worse cover than a photograph, and
 * an email cannot show one at all.
 */
export function coverVideo(media: readonly MediaRef[] | null | undefined): MediaRef | null {
  if (!media?.length) return null;
  return byPosition(media).find((m) => m.kind === "video") ?? null;
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
