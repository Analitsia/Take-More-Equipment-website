"use client";

import { SEGMENTS, SEGMENT_LABELS } from "@takemore/core";
import { useSegment } from "./SegmentProvider";

export default function SegmentSwitcher() {
  const { requested, choose } = useSegment();
  return (
    <div className="flex justify-center px-5 py-5 md:py-7" id="shop-segment">
      <div className="segment-switcher" role="group" aria-label="Shop by segment">
        <span aria-hidden="true" className="segment-switcher-thumb" style={{ transform: `translateX(${requested === "homestaging" ? 0 : 100}%)` }} />
        {SEGMENTS.map((value, index) => (
          <button key={value} type="button" aria-pressed={requested === value}
            onClick={() => choose(value)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
              choose(SEGMENTS[next]);
              (event.currentTarget.parentElement?.querySelectorAll("button")[next] as HTMLButtonElement)?.focus();
            }}>
            {SEGMENT_LABELS[value]}
          </button>
        ))}
      </div>
    </div>
  );
}
