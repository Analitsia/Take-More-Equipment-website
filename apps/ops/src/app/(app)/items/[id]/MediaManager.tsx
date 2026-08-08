"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { createBrowserClient } from "@takemore/db";
import { Panel, Button } from "@takemore/ui";
import { deleteMedia, recordMedia, reorderMedia } from "../actions";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  isVideo,
  mediaUrl,
  storagePathFor,
} from "@/lib/media";

type Media = {
  id: string;
  kind: "photo" | "video";
  storage_path: string | null;
  external_url: string | null;
  position: number;
};

/**
 * Photos and video.
 *
 * Uploads go straight from the browser to Storage rather than through a server
 * action — a 4 MB photo does not need to be uploaded twice, and Vercel's
 * request body limit would refuse it anyway.
 *
 * Compression happens BEFORE the upload, and it is the single most important
 * thing here: a modern phone camera produces 4–8 MB per frame, warehouse wifi
 * is bad, and eight of those is the difference between a ninety-second intake
 * and one nobody finishes.
 *
 * Warehouse wifi being bad is also why every network call here retries, and why
 * one failure no longer abandons the batch — see onFiles().
 */

/**
 * Three attempts, backing off, for something that failed because the signal
 * dropped rather than because it was wrong.
 *
 * A 4xx is not retried: a file that is too large or of a refused MIME type will
 * be exactly as refused in two seconds, and retrying it only makes the person
 * wait longer to be told. Everything else — a timeout, a dropped socket, a 5xx
 * — gets another go, because in this building it is usually somebody walking
 * behind a container.
 */
async function withRetry<T>(attempt: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let n = 0; n < tries; n++) {
    try {
      return await attempt();
    } catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : String(error);
      // Refusals, not failures. Asked-and-answered.
      if (/too large|exceeded|mime|not permitted|invalid|duplicate|already exists/i.test(message)) {
        throw error;
      }
      if (n < tries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** n));
      }
    }
  }
  throw last;
}
export default function MediaManager({
  itemId,
  media,
  onCountChange,
}: {
  itemId: string;
  media: Media[];
  onCountChange: (n: number) => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Named, so a retry is the two that failed rather than all twelve again. */
  const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);

  const ordered = [...media].sort((a, b) => a.position - b.position);
  const photos = ordered.filter((m) => m.kind === "photo");

  useEffect(() => {
    onCountChange(photos.length);
  }, [photos.length, onCountChange]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setFailures([]);
    setUploading({ done: 0, total: files.length });

    const client = createBrowserClient();
    const failed: { name: string; reason: string }[] = [];
    let done = 0;

    for (const file of Array.from(files)) {
      try {
        let upload: File | Blob = file;
        let dimensions: { width?: number; height?: number; duration?: number } = {};

        if (isVideo(file)) {
          if (file.size > MAX_VIDEO_BYTES) {
            throw new Error(
              `Video is ${(file.size / 1024 / 1024).toFixed(0)} MB — the limit is 50 MB. Trim it to about ${MAX_VIDEO_SECONDS} seconds.`
            );
          }
        } else {
          // ~300 KB at 2000px is indistinguishable from the original on a
          // product page and roughly a twentieth of the bytes.
          upload = await imageCompression(file, {
            maxSizeMB: 0.3,
            maxWidthOrHeight: 2000,
            useWebWorker: true,
            fileType: "image/webp",
          });
          const bitmap = await createImageBitmap(upload as Blob).catch(() => null);
          if (bitmap) {
            dimensions = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
          }
        }

        // A fresh path per attempt. `upsert: false` means a retry against the
        // same path would collide with a partial object from the attempt that
        // timed out, and report that collision as the failure — hiding the
        // connection problem that actually caused it.
        const named = isVideo(file) ? file : new File([upload], "photo.webp");

        const path = await withRetry(async () => {
          const attemptPath = storagePathFor(itemId, named);
          const { error: uploadError } = await client.storage
            .from("item-media")
            .upload(attemptPath, upload, {
              contentType: isVideo(file) ? file.type : "image/webp",
              upsert: false,
            });
          if (uploadError) throw new Error(uploadError.message);
          return attemptPath;
        });

        // Retried separately: the bytes are already in Storage at this point,
        // and giving up here would leave an orphaned object with no row
        // pointing at it — invisible in the app and impossible to clean up
        // from inside it.
        await withRetry(async () => {
          const result = await recordMedia(
            itemId,
            path,
            isVideo(file) ? "video" : "photo",
            dimensions
          );
          if (!result.ok) throw new Error(result.error);
        });

        done++;
        setUploading({ done, total: files.length });
      } catch (e) {
        // Record and CARRY ON, rather than breaking out of the loop.
        //
        // This used to `break`, which meant one bad frame in a batch of twelve
        // abandoned the other eleven and left somebody standing in a warehouse
        // re-picking files on a phone. The failures are named at the end so the
        // retry is the two that failed, not all twelve.
        failed.push({
          name: file.name,
          reason: e instanceof Error ? e.message : "Upload failed.",
        });
      }
    }

    setUploading(null);
    setFailures(failed);
    if (failed.length > 0) {
      setError(
        failed.length === files.length
          ? "Nothing uploaded. Check your signal and try again."
          : `${files.length - failed.length} of ${files.length} uploaded. The rest are listed below — pick just those again.`
      );
    }
    if (fileInput.current) fileInput.current.value = "";
    router.refresh();
  }

  async function move(id: string, direction: -1 | 1) {
    const ids = ordered.map((m) => m.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await reorderMedia(itemId, ids);
    router.refresh();
  }

  async function remove(id: string) {
    await deleteMedia(itemId, id);
    router.refresh();
  }

  return (
    <Panel
      title="Photos and video"
      subtitle="The first photo is the one buyers see on the catalogue."
      actions={
        <Button
          variant="secondary"
          onClick={() => fileInput.current?.click()}
          loading={!!uploading}
          className="shrink-0"
        >
          <iconify-icon icon="solar:camera-add-linear" width="16" height="16" noobserver="" />
          Add
        </Button>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/webm"
        // `capture` is deliberately absent: it forces the camera and blocks
        // choosing an existing shot, which is what a worker usually wants.
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />

      {uploading && (
        <p className="text-xs font-light text-muted mb-3">
          Compressing and uploading {uploading.done + 1} of {uploading.total}…
        </p>
      )}

      {error && (
        <div className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5 mb-3">
          <p>{error}</p>
          {/* Named individually, because "upload failed" on a batch of twelve
              means re-picking twelve files on a phone to find the two that
              did not make it. */}
          {failures.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {failures.map((failure) => (
                <li key={failure.name} className="font-light">
                  <span className="font-medium">{failure.name}</span> — {failure.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {ordered.length === 0 ? (
        <button
          onClick={() => fileInput.current?.click()}
          className="w-full border border-dashed border-border rounded-xl py-10 text-center
                     hover:border-white/25 transition-colors group"
        >
          <div className="w-11 h-11 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mx-auto mb-3 group-hover:scale-105 transition-transform">
            <iconify-icon icon="solar:camera-linear" width="20" height="20" noobserver="" />
          </div>
          <p className="text-sm font-light text-white/80">Photograph the machine</p>
          <p className="text-[11px] font-light text-muted mt-1">
            Compressed on this phone before it uploads
          </p>
        </button>
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {ordered.map((m, index) => (
            <li key={m.id} className="relative group">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-background border border-border">
                {m.kind === "video" ? (
                  <>
                    {/* `#t=0.1` with preload="metadata" paints the first frame,
                        so a worker can tell two clips apart at a glance. */}
                    <video
                      src={`${mediaUrl(m) ?? ""}#t=0.1`}
                      preload="metadata"
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-7 h-7 rounded-full bg-background/70 border border-border flex items-center justify-center text-white">
                        <iconify-icon icon="solar:play-bold" width="11" height="11" noobserver="" />
                      </span>
                    </span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl(m, "card") ?? ""}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {index === 0 && m.kind === "photo" && (
                <span className="absolute top-1.5 left-1.5 bg-accent text-background text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full">
                  Card
                </span>
              )}

              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <div className="flex gap-0.5">
                  <button
                    onClick={() => move(m.id, -1)}
                    disabled={index === 0}
                    aria-label="Move earlier"
                    className="w-6 h-6 rounded-md bg-background/90 border border-border flex items-center justify-center disabled:opacity-30"
                  >
                    <iconify-icon icon="solar:arrow-left-linear" width="12" height="12" noobserver="" />
                  </button>
                  <button
                    onClick={() => move(m.id, 1)}
                    disabled={index === ordered.length - 1}
                    aria-label="Move later"
                    className="w-6 h-6 rounded-md bg-background/90 border border-border flex items-center justify-center disabled:opacity-30"
                  >
                    <iconify-icon icon="solar:arrow-right-linear" width="12" height="12" noobserver="" />
                  </button>
                </div>
                <button
                  onClick={() => remove(m.id)}
                  aria-label="Delete"
                  className="w-6 h-6 rounded-md bg-background/90 border border-status-sold/40 text-status-sold flex items-center justify-center"
                >
                  <iconify-icon icon="solar:trash-bin-trash-linear" width="12" height="12" noobserver="" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
