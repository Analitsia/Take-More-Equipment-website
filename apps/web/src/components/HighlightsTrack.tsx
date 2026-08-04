"use client";

import { Fragment, useEffect, useRef } from "react";
import EquipmentCard from "./EquipmentCard";
import { featuredStock } from "@/data/equipment";

/**
 * The highlights row.
 *
 * Desktop keeps the template's behaviour exactly: one set of cards, snap
 * scrolling, no motion of its own. On phones the row drifts sideways on its
 * own like a slow carousel, because a static row only ever shows one card and
 * nothing tells the visitor there are seven more behind it.
 *
 * The drift is driven by the element's own `scrollLeft` rather than a CSS
 * transform, so a swipe is still a plain native scroll — momentum, rubber
 * banding and all. Three copies of the set are rendered on mobile and the
 * scroll position is wrapped by one set width, which makes the loop seamless
 * and leaves a full set of runway in both directions while a finger is down.
 */

/** Pixels per second the row drifts when nobody is touching it. */
const DRIFT_SPEED = 26;
/** Quiet time after the last touch/scroll before the drift picks back up. */
const RESUME_DELAY = 900;
/** Copy 0 is the real row; 1 and 2 are the mobile-only loop padding. */
const COPIES = [0, 1, 2];

export default function HighlightsTrack() {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const isMobile = window.matchMedia("(max-width: 767px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let frame = 0;
    let lastTime = 0;
    let pos = 0; // our own sub-pixel scroll position; scrollLeft may round
    let setWidth = 0;
    let userActive = false; // finger down, or momentum still running
    let onScreen = true;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;

    const cards = () =>
      Array.from(track.querySelectorAll<HTMLElement>('[data-card="stock"]'));

    // One set width = the gap between a card and its copy in the next set.
    // Measured from the DOM so gap/padding changes never need mirroring here.
    const measure = () => {
      const all = cards();
      const first = all[0];
      const second = all[featuredStock.length];
      setWidth = first && second ? second.offsetLeft - first.offsetLeft : 0;
    };

    // Fold a position back into the middle copy — visually identical content,
    // but with a full set of scrolling room left on either side.
    const wrap = (value: number) => {
      if (setWidth <= 0) return value;
      return setWidth + (((value - setWidth) % setWidth) + setWidth) % setWidth;
    };

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      lastTime = time;
      if (userActive || setWidth <= 0) return;
      pos = wrap(pos + DRIFT_SPEED * delta);
      track.scrollLeft = pos;
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    };

    const start = () => {
      if (frame || !isMobile.matches || reduced.matches || !onScreen) return;
      measure();
      if (setWidth <= 0) return;
      pos = wrap(track.scrollLeft || setWidth);
      track.scrollLeft = pos;
      frame = requestAnimationFrame(tick);
    };

    // A swipe takes over completely; the drift resumes once the scroll (and
    // its momentum tail) has been quiet for a moment.
    const resumeSoon = () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        userActive = false;
        lastTime = 0;
        measure();
        pos = wrap(track.scrollLeft);
        track.scrollLeft = pos;
      }, RESUME_DELAY);
    };

    const onUserStart = () => {
      userActive = true;
      clearTimeout(resumeTimer);
    };

    const onUserEnd = () => {
      if (userActive) resumeSoon();
    };

    const onScroll = () => {
      // Only meaningful while the user drives — otherwise this fires for our
      // own scrollLeft writes on every frame.
      if (userActive) resumeSoon();
    };

    track.addEventListener("pointerdown", onUserStart);
    track.addEventListener("touchstart", onUserStart, { passive: true });
    track.addEventListener("wheel", onUserStart, { passive: true });
    track.addEventListener("pointerup", onUserEnd);
    track.addEventListener("pointercancel", onUserEnd);
    track.addEventListener("touchend", onUserEnd, { passive: true });
    track.addEventListener("touchcancel", onUserEnd, { passive: true });
    track.addEventListener("scroll", onScroll, { passive: true });

    // Don't burn frames on a row nobody can see.
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start();
        else stop();
      },
      { threshold: 0 },
    );
    observer.observe(track);

    const onResize = () => {
      measure();
      if (!userActive && setWidth > 0) {
        pos = wrap(track.scrollLeft);
        track.scrollLeft = pos;
      }
    };
    window.addEventListener("resize", onResize);

    const onModeChange = () => {
      stop();
      if (isMobile.matches && !reduced.matches) start();
      else track.scrollLeft = 0; // back to the plain desktop row
    };
    isMobile.addEventListener("change", onModeChange);
    reduced.addEventListener("change", onModeChange);

    start();

    return () => {
      stop();
      clearTimeout(resumeTimer);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      isMobile.removeEventListener("change", onModeChange);
      reduced.removeEventListener("change", onModeChange);
      track.removeEventListener("pointerdown", onUserStart);
      track.removeEventListener("touchstart", onUserStart);
      track.removeEventListener("wheel", onUserStart);
      track.removeEventListener("pointerup", onUserEnd);
      track.removeEventListener("pointercancel", onUserEnd);
      track.removeEventListener("touchend", onUserEnd);
      track.removeEventListener("touchcancel", onUserEnd);
      track.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      ref={trackRef}
      className="flex gap-4 md:gap-6 overflow-x-auto hide-scrollbar px-6 md:px-12 pb-8 md:pb-12 md:snap-x md:snap-mandatory"
    >
      {COPIES.map((copy) =>
        copy === 0 ? (
          <Fragment key={copy}>
            {featuredStock.map((item) => (
              <EquipmentCard key={item.slug} {...item} />
            ))}
          </Fragment>
        ) : (
          // `contents` keeps the cards as direct flex items; `md:hidden` drops
          // the whole copy on desktop, where the row doesn't loop.
          <div key={copy} className="contents md:hidden" aria-hidden="true">
            {featuredStock.map((item) => (
              <EquipmentCard key={item.slug} {...item} decorative />
            ))}
          </div>
        ),
      )}
    </div>
  );
}
