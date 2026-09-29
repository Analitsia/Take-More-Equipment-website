/** Storefront audiences are independent of an item's physical category. */
export const SEGMENTS = ["homestaging", "industrial-kitchen"] as const;
export type Segment = (typeof SEGMENTS)[number];
export const SEGMENT_LABELS: Record<Segment, string> = {
  homestaging: "Homestaging",
  "industrial-kitchen": "Industrial Kitchen",
};

export function validSegments(value: unknown): value is Segment[] {
  return Array.isArray(value) && value.length > 0 && value.length <= SEGMENTS.length
    && new Set(value).size === value.length
    && value.every((segment) => SEGMENTS.includes(segment));
}

/** Legacy listings keep their existing category audience until explicitly edited. */
export function itemSegments(specs: unknown, legacyDivision?: string | null): Segment[] {
  if (specs && typeof specs === "object" && "segments" in specs) {
    return validSegments(specs.segments) ? specs.segments : [];
  }
  return SEGMENTS.includes(legacyDivision as Segment) ? [legacyDivision as Segment] : [];
}
