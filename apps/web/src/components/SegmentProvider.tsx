"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { SEGMENTS, type Segment } from "@takemore/core";

const SegmentContext = createContext<{
  segment: Segment;
  requested: Segment;
  choose: (segment: Segment) => void;
}>({ segment: "industrial-kitchen", requested: "industrial-kitchen", choose: () => {} });

export const useSegment = () => useContext(SegmentContext);

export default function SegmentProvider({ children }: { children: ReactNode }) {
  const [segment, setSegment] = useState<Segment>("industrial-kitchen");
  const [requested, setRequested] = useState<Segment>("industrial-kitchen");
  const current = useRef<Segment>("industrial-kitchen");
  const target = useRef<Segment>("industrial-kitchen");
  const generation = useRef(0);
  const running = useRef<Animation[]>([]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("takemore-segment") as Segment;
      if (SEGMENTS.includes(saved)) {
        current.current = target.current = saved;
        setSegment(saved);
        setRequested(saved);
        document.documentElement.dataset.segment = saved;
      }
    } catch { /* Storage may be unavailable in private browsing. */ }
    // Decode the small alternate hero after initial rendering, before switching.
    const timer = window.setTimeout(() => {
      const image = new window.Image();
      image.src = "/images/homestaging-hero.webp";
      void image.decode().catch(() => {});
    }, 1200);
    return () => {
      clearTimeout(timer);
      generation.current++;
      running.current.forEach((animation) => animation.cancel());
    };
  }, []);

  const choose = async (next: Segment) => {
    if (target.current === next) return;
    target.current = next;
    setRequested(next);
    const version = ++generation.current;
    // Sample before cancelling so a reversal continues from the current frame.
    const surfaces = Array.from(document.querySelectorAll<HTMLElement>("[data-segment-surface]"));
    const visible = surfaces.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    const starts = visible.map((node) => {
      const style = getComputedStyle(node);
      return { opacity: style.opacity, filter: style.filter };
    });
    running.current.forEach((animation) => animation.cancel());
    running.current = [];

    const commit = () => {
      current.current = next;
      document.documentElement.dataset.segment = next;
      flushSync(() => setSegment(next));
      try { sessionStorage.setItem("takemore-segment", next); } catch { /* optional */ }
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !visible.length) {
      commit();
      return;
    }
    const finish = async (animations: Animation[]) => {
      running.current = animations;
      await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
    };
    const changing = current.current !== next;
    if (changing) {
      await finish(visible.map((node, index) => node.animate([
        starts[index], { opacity: 0, filter: "blur(5px)" },
      ], { duration: 95, easing: "ease-out", fill: "forwards" })));
      if (version !== generation.current) return;
      commit();
    }
    const incoming = visible.map((node, index) => node.animate([
      changing ? { opacity: 0, filter: "blur(5px)" } : starts[index],
      { opacity: 1, filter: "blur(0px)" },
    ], { duration: 175, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" }));
    const outgoing = running.current;
    outgoing.forEach((animation) => animation.cancel());
    await finish(incoming);
    if (version !== generation.current) return;
    [...outgoing, ...incoming].forEach((animation) => animation.cancel());
    running.current = [];
  };

  return <SegmentContext.Provider value={{ segment, requested, choose }}>{children}</SegmentContext.Provider>;
}
