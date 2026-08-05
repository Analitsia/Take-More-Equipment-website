import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * iOS home-screen icon. No baked-in rounding here — iOS applies its own
 * corner mask to whatever square it's given, so a self-rounded square would
 * get rounded twice.
 */
export default function AppleIcon() {
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
        }}
      >
        <span
          style={{
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: -4,
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
