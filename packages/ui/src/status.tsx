import { STATUS_LABELS, type ItemStatus } from "@takemore/core";
import { STATUS_CLASSES } from "./tokens.ts";

/**
 * The status pill.
 *
 * Seven states need to be told apart at a glance on a phone held at arm's
 * length, which is why they carry a colour as well as a word — but the brand
 * accent stays reserved for `listed`, so the one saturated thing on a board is
 * always the unit that can make money.
 */
export function StatusPill({
  status,
  size = "md",
}: {
  status: ItemStatus;
  size?: "sm" | "md";
}) {
  const c = STATUS_CLASSES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium uppercase tracking-wider
        ${c.border} ${c.tint} ${c.text}
        ${size === "sm" ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Published / draft, which is a different axis from status entirely — a sold
 * machine stays published until a human takes it down. Showing them as two
 * separate badges is the clearest way to keep that distinction visible.
 */
export function PublishPill({ publishedAt }: { publishedAt: string | null }) {
  return publishedAt ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 text-accent px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider">
      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
      Live
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border text-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider">
      <span className="w-1.5 h-1.5 rounded-full bg-muted" />
      Draft
    </span>
  );
}
