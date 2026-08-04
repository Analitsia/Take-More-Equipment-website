"use client";

import { Fragment, useEffect, useRef } from "react";
import EquipmentCard from "./EquipmentCard";
import { featuredStock } from "@/data/equipment";

/**
 * The highlights row — a continuously drifting carousel on every screen size.
 *
 * The drift is a real compositor animation on the track, not a `transform` this
 * component rewrites every frame. That distinction is the whole reason the row
 * looks right:
 *
 * A transform written from JavaScript is a main-thread animation. The browser
 * re-paints the moving content each frame, and painting snaps every text box to
 * the pixel grid *independently*. So as the row slides through fractional
 * positions, each label rounds to a whole pixel a fraction of a frame before or
 * after its neighbours, and the small labels visibly jump sideways inside a card
 * that is otherwise moving smoothly. Measured at 1× device pixel ratio, 96% of
 * label observations were re-rasterised between consecutive frames.
 *
 * Handing the animation to the compositor removes the cause rather than the
 * symptom: the subtree is rasterised once and from then on only translated, so
 * glyph positions are frozen relative to the card they sit on — at any device
 * pixel ratio, any zoom level, any sub-pixel phase. Nothing inside a card can
 * come loose from anything else, because none of it is ever drawn again.
 *
 * User input drives the same animation instead of competing with it. A drag
 * seeks its clock, a fling raises `playbackRate` and decays back to 1, so the
 * row is only ever one transform and there is never a second source of truth
 * for where it sits.
 */

/** Seconds a card takes to travel its own width — keeps the pace even across breakpoints. */
const SECONDS_PER_CARD = 9;
/** Speed ceiling for a fling, as a multiple of the idle drift, so a hard flick stays readable. */
const MAX_RATE = 70;
/** Share of the extra fling speed kept at each step of the settle. */
const DECAY = 0.82;
const DECAY_MS = 60;
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

    let drift: Animation | null = null;
    let duration = 0; // ms for one full set of cards to pass
    let pxPerMs = 0; // idle speed, used to convert gestures into clock time
    let onScreen = true;
    let held = false; // paused for a drag or for keyboard focus
    let settleTimer = 0;

    let dragging = false;
    let dragPointer = -1;
    let lastX = 0;
    let startX = 0;
    let travelled = 0; // furthest the pointer got from where it went down
    let samples: { time: number; x: number }[] = [];
    let swallowClick = false;

    const clock = () => Number(drift?.currentTime ?? 0);

    // The clock is kept inside the second lap. Every lap looks the same, so the
    // choice is free, and it leaves a full lap of headroom below zero — where an
    // animation stops rather than looping — for a backwards fling to run into.
    const lap = (time: number) =>
      duration > 0
        ? (((time - duration) % duration) + duration) % duration + duration
        : time;

    /** Move the row `px` to the left, by advancing the animation's own clock. */
    const seek = (px: number) => {
      if (!drift || !pxPerMs) return;
      drift.currentTime = lap(clock() + px / pxPerMs);
    };

    const idle = () => {
      if (!drift) return;
      if (held || !onScreen || calm.matches) drift.pause();
      else drift.play();
    };

    // One copy's width is the distance from a card to its own duplicate in the
    // next copy — read from layout so gap/size changes never need mirroring.
    // It has to be read sub-pixel: `offsetLeft` rounds to whole pixels, and a
    // card sized in `vw` rarely lands on one, so a rounded width would leave the
    // loop a fraction of a pixel short and nudge the row once per lap.
    const build = () => {
      const cards = track.querySelectorAll<HTMLElement>('[data-card="stock"]');
      const first = cards[0];
      const twin = cards[featuredStock.length];
      const setWidth =
        first && twin
          ? twin.getBoundingClientRect().left - first.getBoundingClientRect().left
          : 0;

      // Rebuilding after a resize keeps the row where it was, in proportion.
      const progress = duration > 0 ? (clock() % duration) / duration : 0;
      const rate = drift?.playbackRate ?? 1;
      drift?.cancel();
      drift = null;

      if (setWidth <= 0) {
        duration = 0;
        pxPerMs = 0;
        return;
      }

      duration = SECONDS_PER_CARD * featuredStock.length * 1000;
      pxPerMs = setWidth / duration;
      drift = track.animate(
        [
          { transform: "translate3d(0, 0, 0)" },
          { transform: `translate3d(${-setWidth}px, 0, 0)` },
        ],
        { duration, iterations: Infinity, easing: "linear" },
      );
      drift.currentTime = lap(progress * duration);
      drift.playbackRate = rate;
      idle();
    };

    // A fling eases back into the idle drift by stepping `playbackRate` down,
    // rather than by nudging the transform each frame — the compositor keeps
    // interpolating between steps, so the row never returns to the main thread.
    const settle = () => {
      settleTimer = 0;
      if (!drift) return;
      // A backwards fling runs the clock down, and an animation stops at zero
      // rather than looping past it. Re-lapping keeps a full lap in hand.
      if (duration > 0) drift.currentTime = lap(clock());
      const extra = drift.playbackRate - 1;
      if (Math.abs(extra) < 0.06) {
        drift.playbackRate = 1;
        return;
      }
      drift.playbackRate = 1 + extra * DECAY;
      settleTimer = window.setTimeout(settle, DECAY_MS);
    };

    const stopSettle = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = 0;
    };

    // ---- drag -------------------------------------------------------------

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== dragPointer) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      travelled = Math.max(travelled, Math.abs(event.clientX - startX));
      seek(-dx);
      samples.push({ time: event.timeStamp, x: event.clientX });
      if (samples.length > 10) samples.shift();
    };

    const endDrag = (event: PointerEvent, fling: boolean) => {
      if (!dragging || event.pointerId !== dragPointer) return;
      dragging = false;
      dragPointer = -1;
      held = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);

      // Fling speed comes from the last moments of the gesture only, so letting
      // go after holding still hands back a still row, not the speed of a
      // stroke that happened half a second earlier.
      const recent = samples.filter((s) => event.timeStamp - s.time < 140);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const span = recent.length > 1 ? last.time - first.time : 0;
      const speed =
        fling && span > 8 ? -(last.x - first.x) / span : pxPerMs; // px/ms
      samples = [];
      if (drift && pxPerMs)
        drift.playbackRate = clamp(speed / pxPerMs, MAX_RATE) || 1;
      if (travelled > DRAG_SLOP) swallowClick = true;
      idle();
      settle();
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
      stopSettle();
      if (drift) drift.playbackRate = 1;
      idle();
      // A drag that never produced a click (pointer released off the row, or a
      // touch fling) must not leave the suppression armed for the next tap.
      swallowClick = false;
      samples = [{ time: event.timeStamp, x: event.clientX }];
      // Listening on window (rather than capturing the pointer) keeps the click
      // on the card's link intact for a tap that never became a drag.
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
      seek(event.deltaX);
      if (drift && pxPerMs && !held) {
        stopSettle();
        drift.playbackRate = clamp((event.deltaX * 18) / 1000 / pxPerMs, MAX_RATE) || 1;
        settle();
      }
    };

    // ---- keyboard ---------------------------------------------------------

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.matches(":focus-visible")) return;
      held = true; // hold still while a card is being read
      idle();
      const card = target.closest<HTMLElement>('[data-card="stock"]');
      if (!card) return;
      const box = viewport.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      if (rect.left < box.left) seek(rect.left - box.left - 24);
      else if (rect.right > box.right) seek(rect.right - box.right + 24);
    };

    const onFocusOut = () => {
      if (dragging) return;
      held = false;
      idle();
    };

    // ---- lifecycle --------------------------------------------------------

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        idle(); // nothing animates for a row nobody can see
      },
      { threshold: 0 },
    );
    observer.observe(viewport);

    const resizeObserver = new ResizeObserver(build);
    resizeObserver.observe(viewport);

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("click", onClick, true);
    viewport.addEventListener("dragstart", onDragStart);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("focusin", onFocusIn);
    viewport.addEventListener("focusout", onFocusOut);
    calm.addEventListener("change", idle);

    build();

    return () => {
      stopSettle();
      drift?.cancel();
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
      calm.removeEventListener("change", idle);
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
