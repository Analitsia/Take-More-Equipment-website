"use client";

import { Fragment, useEffect, useRef } from "react";
import EquipmentCard from "./EquipmentCard";
import type { Equipment } from "@/data/equipment";

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
 *
 * A gesture does have to hold the animation still, though, and a held animation
 * is a static transform the browser may redraw — so gestures move the row in
 * whole device pixels, which keeps every card's sub-pixel phase fixed and the
 * existing raster valid. Without that, dragging brought the dashing straight
 * back on any screen whose ratio isn't a whole number: measured at 2.625x,
 * every one of 45 drag steps failed to be a pure translation, against four
 * after — and those four are the frames where a gesture starts or a new card
 * arrives on screen.
 *
 * The card-arriving-on-screen case turned out not to be about rasterisation at
 * all. <iconify-icon> keeps an IntersectionObserver per icon and deletes its
 * rendered <svg> as the icon crosses the viewport edge, so each card was
 * rewriting its own contents on the way in and out — a layout change and a
 * repaint at exactly the position where the dashing was reported, and the
 * reason the icons quietly vanished when the row was left drifting on its own.
 * See the `noobserver` note in EquipmentCard. It is worth holding onto the
 * general shape of that: a held row is only still if nothing inside it moves
 * on its own, so anything that mutates a card while the row is on screen will
 * undo the work this file does, however cheap the mutation looks.
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

export default function HighlightsTrack({ items }: { items: Equipment[] }) {
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
    let startX = 0;
    let travelled = 0; // furthest the pointer got from where it went down
    let samples: { time: number; x: number }[] = [];
    let swallowClick = false;

    let baseTime = 0; // clock when the gesture started
    let dragRaw = 0; // unrounded pointer travel since then
    let grid = 1; // device pixels per CSS pixel, read per gesture

    const clock = () => Number(drift?.currentTime ?? 0);

    // While a gesture drives the row, the animation is paused — the transform is
    // static, so the browser is free to redraw it, and redrawing rounds every
    // text box to the pixel grid independently. That is the same repaint that
    // made the idle row dash, and moving the row a fraction of a pixel at a time
    // brings it straight back.
    //
    // So a gesture moves the row in whole *device* pixels. Every card's
    // sub-pixel phase is then fixed for the whole gesture, the existing raster
    // stays valid, and the compositor just slides it. The granularity is one
    // device pixel — a third of a CSS pixel on a 3x phone — against content that
    // is tracking a finger, so it cannot be seen.
    //
    // Whole *CSS* pixels would not do: a phone at 2.625x turns each one into
    // 2.625 device pixels, which is exactly the case that dashes worst.
    // `devicePixelRatio` is read per gesture rather than cached, so page zoom
    // between gestures can't leave the row rounding to a stale grid.
    const onGrid = (px: number) => Math.round(px * grid) / grid;

    /** Move the row `px` to the left, by advancing the animation's own clock. */
    const seek = (px: number) => {
      if (!drift || !pxPerMs) return;
      drift.currentTime = clock() + px / pxPerMs;
    };

    // The clock only ever needs to be kept clear of zero, where an animation
    // stops instead of looping. Rebasing by whole laps leaves the transform
    // exactly where it was — same progress, same position, same phase — so this
    // is free to do, and doing it only when a gesture starts keeps every seek
    // during the gesture a pure translation.
    const refloat = () => {
      if (!drift || duration <= 0) return;
      const t = clock();
      if (t > duration * 64 && t < duration * 4096) return;
      drift.currentTime = duration * 1024 + (((t % duration) + duration) % duration);
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
      const twin = cards[items.length];
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

      duration = SECONDS_PER_CARD * items.length * 1000;
      pxPerMs = setWidth / duration;
      drift = track.animate(
        [
          { transform: "translate3d(0, 0, 0)" },
          { transform: `translate3d(${-setWidth}px, 0, 0)` },
        ],
        { duration, iterations: Infinity, easing: "linear" },
      );
      drift.currentTime = progress * duration;
      drift.playbackRate = rate;
      refloat();
      idle();
    };

    // A fling eases back into the idle drift by stepping `playbackRate` down,
    // rather than by nudging the transform each frame — the compositor keeps
    // interpolating between steps, so the row never returns to the main thread.
    const settle = () => {
      settleTimer = 0;
      if (!drift) return;
      // Only `playbackRate` is touched here. Writing `currentTime` as well would
      // re-seek a running compositor animation seventeen times per fling, and
      // each seek is a chance to hand the row back to the main thread mid-flight.
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
      dragRaw = startX - event.clientX;
      travelled = Math.max(travelled, Math.abs(dragRaw));
      // Rounded against where the gesture began, not step by step, so rounding
      // can never accumulate into a drift away from the finger.
      if (drift && pxPerMs)
        drift.currentTime = baseTime + onGrid(dragRaw) / pxPerMs;
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
      startX = event.clientX;
      dragRaw = 0;
      travelled = 0;
      grid = window.devicePixelRatio || 1;
      stopSettle();
      if (drift) drift.playbackRate = 1;
      idle(); // stop the clock before reading where the gesture starts from
      refloat();
      baseTime = clock();
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
      if (held) return;
      // A trackpad reports fractional deltas, so these are rounded to the device
      // grid too — each push is a whole number of device pixels, and the row's
      // phase survives the gesture just as it does under a finger.
      grid = window.devicePixelRatio || 1;
      seek(onGrid(event.deltaX));
      if (drift && pxPerMs) {
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
      // Also on the grid: the row is about to sit still under a reader, and a
      // half-pixel landing would redraw every label on the way in.
      grid = window.devicePixelRatio || 1;
      if (rect.left < box.left) seek(onGrid(rect.left - box.left - 24));
      else if (rect.right > box.right) seek(onGrid(rect.right - box.right + 24));
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
              {items.map((item) => (
                <EquipmentCard key={item.slug} {...item} />
              ))}
            </Fragment>
          ) : (
            // Duplicates make the loop seamless; they are decoration only, so
            // they stay out of the accessibility tree and the tab order.
            // `contents` keeps the cards themselves as the flex items.
            <div key={copy} className="contents" aria-hidden="true">
              {items.map((item) => (
                <EquipmentCard key={item.slug} {...item} decorative />
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
