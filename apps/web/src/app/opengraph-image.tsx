import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The picture a shared link carries.
 *
 * WhatsApp, iMessage and every social preview fetch this when somebody pastes
 * the homepage — and that is how most of this site's links travel. Product
 * pages carry their own photograph; this is the fallback for everything else.
 *
 * Built from the brand: the near-black ground, the accent, the horizontal logo
 * from apps/web/public. The logo is read from disk because ImageResponse runs
 * on the server and cannot fetch a same-origin asset at build time; if it is
 * not found the image falls back to type alone rather than failing the route.
 */

export const alt = "Take More — Refurbished Catering Equipment, Cape Town";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens, mirrored from packages/ui tailwind-preset.
const BACKGROUND = "#080805";
const CARD = "#121212";
const BORDER = "#2A2A2A";
const ACCENT = "#30A8B0";
const MUTED = "#888888";

async function logoDataUri(): Promise<string | null> {
  const candidates = [
    join(process.cwd(), "public", "takemore-logo-horizontal.svg"),
    join(process.cwd(), "apps", "web", "public", "takemore-logo-horizontal.svg"),
  ];
  for (const path of candidates) {
    try {
      const svg = await readFile(path, "utf8");
      return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    } catch {
      // try the next location
    }
  }
  return null;
}

export default async function OpenGraphImage() {
  const logo = await logoDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BACKGROUND,
          color: "#ffffff",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" width={420} height={79} />
          ) : (
            <div style={{ fontSize: 40, fontWeight: 500, letterSpacing: -1 }}>Take More</div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 24px",
              borderRadius: 999,
              border: `1px solid ${BORDER}`,
              background: CARD,
              color: MUTED,
              fontSize: 22,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            <div style={{ width: 20, height: 4, borderRadius: 999, background: ACCENT }} />
            Cape Town
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 20, height: 4, borderRadius: 999, background: ACCENT }} />
            <div style={{ color: ACCENT, fontSize: 22, letterSpacing: 3, textTransform: "uppercase" }}>
              Commercial Catering Equipment
            </div>
          </div>
          <div style={{ fontSize: 76, fontWeight: 500, letterSpacing: -3, lineHeight: 1.05 }}>
            Restaurant-Grade Kit,
          </div>
          <div style={{ fontSize: 76, fontWeight: 500, letterSpacing: -3, lineHeight: 1.05 }}>
            Half The Retail Price
          </div>
          <div style={{ color: MUTED, fontSize: 28, marginTop: 24, fontWeight: 300 }}>
            Rebuilt in our own workshop. Tested under load. Priced on the page.
          </div>
        </div>
      </div>
    ),
    size
  );
}
