#!/usr/bin/env node
/**
 * Regenerates the favicon / touch-icon PNGs for both apps from the brand
 * logomark in assets/brand.
 *
 * The mark ships as a bare shape on a transparent canvas, which is not a usable
 * favicon on its own: a browser tab strip can be light or dark, and a
 * transparent dark-teal mark vanishes against the dark one. So the icon is
 * composed here as a filled tile — brand cream behind, teal mark in front —
 * which reads the same whatever the tab is painted.
 *
 * Run after any change to the mark or the brand colours:
 *   npm run icons:brand
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TILE = "#f3efe6"; // brand cream — the "light background" cut of the mark
const MARK = "#123f42"; // brand teal

/**
 * The mark's own ink box inside its 832 x 623.37 viewBox. The file carries
 * uneven slack around the artwork, so centring the viewBox would sit the mark
 * visibly low; these are the real extents of the paths, read off the geometry.
 */
const INK = { x: 63.1, y: 62.97, w: 705.8, h: 497.45 };

/** Share of the tile's width the mark spans. The rest is breathing room. */
const MARK_WIDTH_RATIO = 0.76;

const OUTPUTS = [
  { file: "apps/web/src/app/icon.png", size: 64 },
  { file: "apps/web/src/app/apple-icon.png", size: 180 },
  { file: "apps/ops/src/app/icon.png", size: 64 },
  { file: "apps/ops/src/app/apple-icon.png", size: 180 },
];

/** Renders the tile at a generous size, then downsamples — cleaner edges. */
const CANVAS = 1024;

async function buildTileSvg() {
  const src = await readFile(path.join(ROOT, "assets/brand/takemore-logomark.svg"), "utf8");

  // Lift just the shapes out of the source file; its <defs>/<style> block styles
  // them by class, which does not survive being re-parented, so they are filled
  // explicitly instead.
  const shapes = [...src.matchAll(/<(polygon|path)\b[^>]*\/>/g)]
    .map((m) => m[0].replace(/\sclass="[^"]*"/, ` fill="${MARK}"`))
    .join("\n    ");

  if (!shapes) throw new Error("no shapes found in the logomark source");

  const scale = (MARK_WIDTH_RATIO * CANVAS) / INK.w;
  const tx = (CANVAS - INK.w * scale) / 2 - INK.x * scale;
  const ty = (CANVAS - INK.h * scale) / 2 - INK.y * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <rect width="${CANVAS}" height="${CANVAS}" fill="${TILE}"/>
  <g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(6)})">
    ${shapes}
  </g>
</svg>`;
}

const svg = Buffer.from(await buildTileSvg());

for (const { file, size } of OUTPUTS) {
  const out = path.join(ROOT, file);
  await writeFile(out, await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toBuffer());
  console.log(`wrote ${file} (${size}x${size})`);
}
