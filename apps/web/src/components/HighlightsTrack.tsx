"use client";

import { Fragment, useEffect, useRef } from "react";
import EquipmentCard from "./EquipmentCard";
import { featuredStock } from "@/data/equipment";

/**
 * The highlights row — a continuously drifting carousel on every screen size.
 *
 * The row moves by animating one `transform: translate3d()` on the track, not
 * by writing `scrollLeft` on a native scroller. That matters for two reasons:
 *
 * 1. Scroll offsets are quantised to whole pixels. At a slow drift the row
 *    only advances a fraction of a pixel per frame, so a scroll-driven version
 *    sits still for a few frames and then jumps a pixel — the "one pixel at a
 *    time" stutter. A transform carries sub-pixel values straight to the
 *    compositor, so the same speed renders as continuous motion.
 * 2. Scrolling re-rasterises the row on the main thread every frame, and the
 *    cards' `backdrop-filter` panels resample their backdrop a frame late.
 *    That is what made the price panel and title look like they were sliding
 *    around inside the card. Under a single transform the image, the text and
 *    the glass panel are one composited unit — nothing can lag behind
 *    anything else.
 *
 * Dragging (touch or mouse) and horizontal wheel/trackpad input push the row
 * directly, and the extra speed decays exponentially back to the idle drift,
 * so a swipe accelerates the carousel and it settles by itself.
 */

/** Seconds a card takes to travel its own width — keeps the pace even across breakpoints. */
const SECONDS_PER_CARD = 9;
/** Time constant for a fling easing back down to the idle drift. */
const EASE_BACK = 0.65;
/** Speed ceiling, px/s, so a hard flick stays readable. */
const MAX_SPEED = 3000;
/** Past this much movement a gesture is a drag, not a tap on a card. */
const DRAG_SLOP = 8;
/** Copy 0 is the real row; the rest are the loop's padding. */
const COPIES = [0, 1, 2];

const clamp = (value: number, limit: number) =>
  Math.max(-limit, Math.min(limit, value));

export default function HighlightsTrack() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    let setWidth = 0; // width of one copy of the set, gap included
    let offset = 0; // px the track is shifted left by
    let velocity = 0; // px/s, eases back to `drift`
    let drift = 0; // px/s the row moves when left alone
    let frame = 0;
    let lastTime = 0;
    let onScreen = true;
    let held = false; // paused for a drag or for keyboard focus

    let dragging = false;
    let dragPointer = -1;
    let lastX = 0;
    let startX = 0;
    let travelled = 0; // furthest the pointer got from where it went down
    let samples: { time: number; x: number }[] = [];
    let swallowClick = false;

    // One copy's width is the distance from a card to its own duplicate in the
    // next copy — read from layout so gap/size changes never need mirroring.
    const measure = () => {
      const cards = track.querySelectorAll<HTMLElement>('[data-card="stock"]');
      const first = cards[0];
      const twin = cards[featuredStock.length];
      setWidth = first && twin ? twin.offsetLeft - first.offsetLeft : 0;
      drift =
        setWidth > 0 && !calm.matches
          ? setWidth / featuredStock.length / SECONDS_PER_CARD
          : 0;
    };

    // The only write in the animation loop: no layout is read per frame.
    const apply = () => {
      if (setWidth > 0) offset = ((offset % setWidth) + setWidth) % setWidth;
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    };

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      lastTime = time;
      if (held || delta <= 0) return;
      // A flick decays smoothly into the idle drift instead of stopping dead.
      velocity = drift + (velocity - drift) * Math.exp(-delta / EASE_BACK);
      offset += velocity * delta;
      apply();
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    };

    const start = () => {
      if (frame || !onScreen) return;
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    };

    // ---- drag -------------------------------------------------------------

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== dragPointer) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      travelled = Math.max(travelled, Math.abs(event.clientX - startX));
      offset -= dx;
      apply();
      samples.push({ time: event.timeStamp, x: event.clientX });
      if (samples.length > 10) samples.shift();
    };

    const endDrag = (event: PointerEvent, fling: boolean) => {
      if (!dragging || event.pointerId !== dragPointer) return;
      dragging = false;
      dragPointer = -1;
      held = false;
      lastTime = 0;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);

      // Fling speed comes from the last moments of the gesture only, so
      // letting go after holding still hands back a still row, not the speed
      // of a stroke that happened half a second earlier.
      const recent = samples.filter((s) => event.timeStamp - s.time < 140);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const span = recent.length > 1 ? last.time - first.time : 0;
      velocity =
        fling && span > 8
          ? clamp((-(last.x - first.x) / span) * 1000, MAX_SPEED)
          : drift;
      samples = [];
      if (travelled > DRAG_SLOP) swallowClick = true;
    };

    const onPointerUp = (event: PointerEvent) => endDrag(event, true);
    const onPointerCancel = (event: PointerEvent) => endDrag(event, false);

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      dragging = true;
      dragPointer = event.pointerId;
      held = true;
      lastX = event.clientX;
      startX = event.clientX;
      travelled = 0;
      velocity = 0;
      // A drag that never produced a click (pointer released off the row, or a
      // touch fling) must not leave the suppression armed for the next tap.
      swallowClick = false;
      samples = [{ time: event.timeStamp, x: event.clientX }];
      // Listening on window (rather than capturing the pointer) keeps the
      // click on the card's link intact for a tap that never became a drag.
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    };

    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const onDragStart = (event: Event) => event.preventDefault();

    // ---- wheel / trackpad -------------------------------------------------

    const onWheel = (event: WheelEvent) => {
      // Vertical intent belongs to the page.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      offset += event.deltaX;
      velocity = clamp(event.deltaX * 18, MAX_SPEED);
      apply();
    };

    // ---- keyboard ---------------------------------------------------------

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.matches(":focus-visible")) return;
      held = true; // hold still while a card is being read
      const card = target.closest<HTMLElement>('[data-card="stock"]');
      if (!card) return;
      const box = viewport.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      if (rect.left < box.left) offset -= box.left - rect.left + 24;
      else if (rect.right > box.right) offset += rect.right - box.right + 24;
      apply();
    };

    const onFocusOut = () => {
      if (!dragging) held = false;
    };

    // ---- lifecycle --------------------------------------------------------

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start();
        else stop(); // no frames burnt on a row nobody can see
      },
      { threshold: 0 },
    );
    observer.observe(viewport);

    const onResize = () => {
      measure();
      apply();
    };

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(viewport);

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("click", onClick, true);
    viewport.addEventListener("dragstart", onDragStart);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("focusin", onFocusIn);
    viewport.addEventListener("focusout", onFocusOut);
    calm.addEventListener("change", measure);

    measure();
    apply();
    start();

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("click", onClick, true);
      viewport.removeEventListener("dragstart", onDragStart);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("focusin", onFocusIn);
      viewport.removeEventListener("focusout", onFocusOut);
      calm.removeEventListener("change", measure);
    };
  }, []);

  return (
    <div
      ref={viewportRef}
      // `touch-pan-y` leaves vertical page scrolling to the browser and gives
      // horizontal gestures to the carousel.
      className="overflow-hidden pb-8 md:pb-12 touch-pan-y select-none cursor-grab active:cursor-grabbing"
    >
      <div
        ref={trackRef}
        className="flex gap-4 md:gap-6 w-max will-change-transform"
      >
        {COPIES.map((copy) =>
          copy === 0 ? (
            <Fragment key={copy}>
              {featuredStock.map((item) => (
                <EquipmentCard key={item.slug} {...item} />
              ))}
            </Fragment>
          ) : (
            // Duplicates make the loop seamless; they are decoration only, so
            // they stay out of the accessibility tree and the tab order.
            // `contents` keeps the cards themselves as the flex items.
            <div key={copy} className="contents" aria-hidden="true">
              {featuredStock.map((item) => (
                <EquipmentCard key={item.slug} {...item} decorative />
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
