/**
 * Turning the demo dataset's media recipes into actual files.
 *
 * Two kinds of output, both real files with real bytes because the publish gate
 * will not accept anything else (see the long note at the top of
 * demo-dataset.mjs):
 *
 *   photos  a source shot, or a detail crop cut out of one, re-encoded to a
 *           sensible size for Supabase's image transformer to work from
 *   video   a Ken Burns clip over one or two stills — slow push in or out, a
 *           little drift, crossfaded — which is what a walkaround of a machine
 *           standing still in a warehouse actually looks like
 *
 * Everything is cached under .demo-media/ (gitignored) and keyed by content, so
 * a second run downloads nothing and encodes nothing. Deleting that directory
 * is safe; it will rebuild.
 *
 * Requires ffmpeg on PATH.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PHOTOS } from "./demo-dataset.mjs";

const run = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".demo-media");
const SRC = path.join(CACHE, "src");
const OUT = path.join(CACHE, "out");

/** 1280×720 is plenty for a gallery clip and keeps every file under ~1.5 MB. */
const VIDEO_W = 1280;
const VIDEO_H = 720;
const FPS = 25;
const SEGMENT_SECONDS = 5.2;
const SOLO_SECONDS = 6.4;
const FADE_SECONDS = 0.8;

const exists = (p) => stat(p).then(() => true, () => false);

async function ffmpeg(args) {
  try {
    await run("ffmpeg", ["-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 26 });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`ffmpeg failed: ${detail}`);
  }
}

export async function checkFfmpeg() {
  try {
    await run("ffmpeg", ["-version"]);
  } catch {
    throw new Error(
      "ffmpeg is not on PATH. It builds the demo video clips — install it, or run with --skip-video."
    );
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * The stills, fetched once.
 *
 * These are the shots the pre-database mock catalogue used, so they already
 * line up with the machine types in the dataset.
 */
async function ensureSource(key) {
  const id = PHOTOS[key];
  if (!id) throw new Error(`Unknown photo key: ${key}`);
  const file = path.join(SRC, `${key}.jpg`);
  if (await exists(file)) return file;

  const url = `https://images.unsplash.com/${id}?q=85&w=2200&auto=format&fit=crop`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${key} (${res.status})`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/** `crop` is [x, y, w, h] as fractions; this is the ffmpeg filter for it. */
const cropFilter = (crop) =>
  crop ? `crop=iw*${crop[2]}:ih*${crop[3]}:iw*${crop[0]}:ih*${crop[1]},` : "";

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

async function buildPhoto(spec, outFile) {
  const source = await ensureSource(spec.src);
  // A detail crop comes out smaller on purpose — it is a closer look, not a
  // second full frame, and 1600 px is more than the transformer ever asks for.
  const width = spec.crop ? 1600 : 2000;
  await ffmpeg([
    "-i", source,
    "-vf", `${cropFilter(spec.crop)}scale=${width}:-2:flags=lanczos`,
    "-q:v", "3",
    outFile,
  ]);
  return outFile;
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

/**
 * The camera move for one still.
 *
 * Alternating the direction per segment is what stops twenty clips looking like
 * the same clip: some push in, some pull out, and the drift changes axis. The
 * seed is the clip's own name, so the variation is stable across rebuilds
 * rather than random on every run.
 */
function move(seed, index) {
  const h = createHash("sha1").update(`${seed}:${index}`).digest();
  const pushIn = (h[0] & 1) === 0;
  const horizontal = (h[1] & 1) === 0;
  const sign = (h[2] & 1) === 0 ? 1 : -1;
  const zoomMax = 1.12 + (h[3] % 7) / 100; // 1.12 – 1.18
  return { pushIn, horizontal, sign, zoomMax };
}

function segmentFilter(inputIndex, seconds, crop, seed) {
  const frames = Math.round(seconds * FPS);
  const { pushIn, horizontal, sign, zoomMax } = move(seed, inputIndex);
  const step = ((zoomMax - 1) / frames).toFixed(6);

  const z = pushIn
    ? `min(1.0+${step}*on,${zoomMax})`
    : `max(${zoomMax}-${step}*on,1.0)`;

  // The drift: a slow slide of the crop centre across the shot, ±40 px either
  // side of middle. Small enough to read as a camera being held, not as a pan.
  const drift = `((on/${frames})-0.5)*${sign * 80}`;
  const x = horizontal ? `iw/2-(iw/zoom/2)+${drift}` : `iw/2-(iw/zoom/2)`;
  const y = horizontal ? `ih/2-(ih/zoom/2)` : `ih/2-(ih/zoom/2)+${drift}`;

  return (
    `[${inputIndex}:v]${cropFilter(crop)}` +
    `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,` +
    `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${VIDEO_W}x${VIDEO_H}:fps=${FPS},` +
    `setsar=1[s${inputIndex}]`
  );
}

async function buildVideo(spec, outFile, seed) {
  const sources = [];
  for (const key of spec.frames) sources.push(await ensureSource(key));

  const solo = sources.length === 1;
  const seconds = solo ? SOLO_SECONDS : SEGMENT_SECONDS;

  const parts = sources.map((_, i) => segmentFilter(i, seconds, spec.crop, seed));

  let last = "[s0]";
  if (!solo) {
    // offset_k = L_(k-1) - fade, where L_k = (k+1)*seconds - k*fade.
    for (let k = 1; k < sources.length; k++) {
      const previousLength = k * seconds - (k - 1) * FADE_SECONDS;
      const offset = (previousLength - FADE_SECONDS).toFixed(3);
      const label = k === sources.length - 1 ? "[v]" : `[x${k}]`;
      parts.push(
        `${last}[s${k}]xfade=transition=fade:duration=${FADE_SECONDS}:offset=${offset}${label}`
      );
      last = label;
    }
  }
  parts.push(`${last}format=yuv420p[out]`);

  const inputs = sources.flatMap((file) => ["-i", file]);
  await ffmpeg([
    ...inputs,
    "-filter_complex", parts.join(";"),
    "-map", "[out]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "24",
    "-pix_fmt", "yuv420p",
    // Without this the browser has to download the whole file before it can
    // start playing, which for an autoplaying gallery clip is the difference
    // between "it plays" and "it eventually plays".
    "-movflags", "+faststart",
    "-an",
    outFile,
  ]);
  return outFile;
}

// ---------------------------------------------------------------------------
// The public entry point
// ---------------------------------------------------------------------------

/**
 * Build every media file one item needs and hand back what to upload.
 *
 * Returns rows in the shape item_media wants, minus the item_id: a local file
 * to read, the object name to put it under, its kind, its position and its alt
 * text. Ordering is the order in the recipe, and photos are numbered before
 * video because position drives the gallery.
 */
export async function buildMediaFor(item, { skipVideo = false } = {}) {
  await mkdir(SRC, { recursive: true });
  await mkdir(OUT, { recursive: true });

  const rows = [];
  let position = 0;

  for (const [index, spec] of item.media.entries()) {
    if (spec.kind === "video" && skipVideo) continue;

    // The TAIL of the uuid, not the head: every demo id starts `dec0de00`, so
    // slicing the front names item 1's walkaround and item 2's walkaround the
    // same file and the second one silently reuses the first one's cached clip.
    const stem = `${item.id.slice(-4)}-${index}-${spec.label ?? spec.src ?? "clip"}`;
    const extension = spec.kind === "video" ? "mp4" : "jpg";
    const outFile = path.join(OUT, `${stem}.${extension}`);

    if (!(await exists(outFile))) {
      if (spec.kind === "video") await buildVideo(spec, outFile, stem);
      else await buildPhoto(spec, outFile);
    }

    rows.push({
      kind: spec.kind,
      file: outFile,
      objectName: `${stem}.${extension}`,
      contentType: spec.kind === "video" ? "video/mp4" : "image/jpeg",
      position: position++,
      altText:
        spec.kind === "video"
          ? `${item.title} — ${spec.label ?? "video"}`
          : `${item.title}${spec.label ? ` — ${spec.label}` : ""}`,
    });
  }

  return rows;
}

export async function readMedia(row) {
  return readFile(row.file);
}

export const CACHE_DIR = CACHE;
