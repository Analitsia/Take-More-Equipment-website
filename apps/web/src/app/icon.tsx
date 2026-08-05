import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Browser-tab favicon. File-based (App Router picks up `icon.tsx`
 * automatically — no manual <link> or metadata entry needed), so it stays a
 * generated image rather than a checked-in binary. "TME" is Take More
 * Equipment's initials; there is no separate icon mark to draw from.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080805",
          borderRadius: 7,
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: -0.8,
            color: "#D4D414",
          }}
        >
          TME
        </span>
      </div>
    ),
    { ...size }
  );
}
