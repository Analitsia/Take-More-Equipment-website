"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The four characters somebody writes on the machine.
 *
 * It used to render as eleven-pixel grey text next to a date, which is the
 * treatment you give a database key. It is not a database key — it is the one
 * thing on this screen that gets copied onto a physical object with a marker,
 * and then read back off that object across a warehouse. So it is monospaced,
 * widely tracked so the letter cannot merge into the digits, and at `chip` size
 * it is large enough to read while holding a phone in the other hand.
 *
 * Tapping copies it. Not because typing four characters is hard, but because
 * the next thing that happens to this code is usually a paste into a label
 * printer's own software, and a copy that requires selecting text precisely is
 * a copy that gets mistyped instead.
 */
export default function ItemCode({
  code,
  size = "inline",
  className = "",
}: {
  code: string;
  size?: "inline" | "chip" | "label";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Without this, unmounting mid-flash leaves a setState pointed at nothing.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const CHROME = "font-mono tracking-[0.15em] tabular-nums";

  // Written out in full rather than composed, because Tailwind scans source
  // text for complete class names — a template-built class is a class that
  // exists in development and vanishes from the production stylesheet.
  const SIZES = {
    inline: "text-[11px] px-1.5 py-0.5 rounded-md",
    chip: "text-lg md:text-xl px-3 py-1.5 rounded-xl",
    label: "text-6xl md:text-8xl",
  } as const;

  const body = `${CHROME} ${SIZES[size]} ${className}`;

  // The print page has no clipboard to offer and no business having a button
  // in the middle of a label.
  if (size === "label") {
    return <span className={body}>{code}</span>;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Insecure origin, or permission refused. The code is on screen and
      // legible, which is the fallback — a thrown error here would be noise
      // about a convenience.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : `Copy ${code}`}
      aria-label={copied ? `${code} copied` : `Copy code ${code}`}
      className={`${body} inline-flex items-center gap-2 border transition-colors
                  ${copied
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-border bg-background text-white/85 hover:border-white/25"}`}
    >
      {code}
      <iconify-icon
        icon={copied ? "solar:check-circle-linear" : "solar:copy-linear"}
        width={size === "chip" ? "16" : "12"}
        height={size === "chip" ? "16" : "12"}
        noobserver=""
        className="opacity-60"
      />
    </button>
  );
}
