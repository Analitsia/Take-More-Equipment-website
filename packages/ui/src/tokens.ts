import type { ItemStatus } from "@takemore/core";

/**
 * Tailwind class fragments per status.
 *
 * Written out in full rather than composed as `bg-status-${status}` because
 * Tailwind scans source text for complete class names — an interpolated class
 * is not in the stylesheet, and the bug shows up as a colourless board only in
 * a production build.
 */
export const STATUS_CLASSES: Record<
  ItemStatus,
  { text: string; dot: string; border: string; tint: string }
> = {
  intake: {
    text: "text-status-intake",
    dot: "bg-status-intake",
    border: "border-status-intake/40",
    tint: "bg-status-intake/10",
  },
  refurbishing: {
    text: "text-status-refurbishing",
    dot: "bg-status-refurbishing",
    border: "border-status-refurbishing/40",
    tint: "bg-status-refurbishing/10",
  },
  ready: {
    text: "text-status-ready",
    dot: "bg-status-ready",
    border: "border-status-ready/40",
    tint: "bg-status-ready/10",
  },
  listed: {
    text: "text-status-listed",
    dot: "bg-status-listed",
    border: "border-status-listed/40",
    tint: "bg-status-listed/10",
  },
  reserved: {
    text: "text-status-reserved",
    dot: "bg-status-reserved",
    border: "border-status-reserved/40",
    tint: "bg-status-reserved/10",
  },
  sold: {
    text: "text-status-sold",
    dot: "bg-status-sold",
    border: "border-status-sold/40",
    tint: "bg-status-sold/10",
  },
  handed_over: {
    text: "text-status-handed_over",
    dot: "bg-status-handed_over",
    border: "border-status-handed_over/40",
    tint: "bg-status-handed_over/10",
  },
};

/**
 * The one form-control style on the storefront today (the catalogue's sort
 * select), lifted verbatim so every input in the ops app speaks the same
 * language as the site it feeds.
 */
export const CONTROL_CLASS =
  "bg-card border border-border rounded-xl px-3 py-2 text-sm font-light text-white/90 " +
  "hover:border-white/20 focus:border-accent focus:outline-none transition-colors";

export const PRIMARY_BUTTON_CLASS =
  "bg-accent text-background rounded-2xl px-6 py-3 text-sm font-medium " +
  "hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity";

export const SECONDARY_BUTTON_CLASS =
  "border border-border rounded-2xl px-6 py-3 text-sm font-light " +
  "hover:border-white/25 transition-colors";
