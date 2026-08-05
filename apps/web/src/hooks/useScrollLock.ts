"use client";

import { useEffect } from "react";

/**
 * Locks background scrolling while an overlay is open.
 *
 * `body { overflow: hidden }` alone is not enough here for two reasons:
 *
 * 1. globals.css sets `html { overflow-x: hidden }`. CSS only propagates the
 *    body's overflow to the viewport when the root element is `visible`, so
 *    once html is non-visible it becomes the scroller and body's rule is
 *    ignored.
 * 2. iOS Safari scrolls the document by touch regardless of overflow on either
 *    element. Pinning the body with `position: fixed` is the reliable fix.
 *
 * The scroll offset is restored on release, and the scrollbar's width is
 * replaced with padding so the page behind does not shift sideways.
 *
 * That padding is on the body, which a `position: fixed` overlay does not sit
 * inside — it spans the viewport, scrollbar gutter included, and so centres its
 * own content half a scrollbar to the right of everything in the page below.
 * The width is published as `--lock-gutter` for those overlays to pad
 * themselves by (see `.lock-gutter` in globals.css).
 */
let locks = 0;
let savedY = 0;
let saved: Partial<CSSStyleDeclaration> = {};

function lock() {
  if (locks++ > 0) return;

  const body = document.body;
  const html = document.documentElement;
  savedY = window.scrollY;

  saved = {
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
    overflow: body.style.overflow,
  };

  const scrollbar = window.innerWidth - html.clientWidth;

  body.style.position = "fixed";
  body.style.top = `-${savedY}px`;
  body.style.width = "100%";
  body.style.overflow = "hidden";
  if (scrollbar > 0) {
    body.style.paddingRight = `${scrollbar}px`;
    html.style.setProperty("--lock-gutter", `${scrollbar}px`);
  }
}

function release() {
  if (--locks > 0) return;
  locks = 0;

  const body = document.body;
  body.style.position = saved.position ?? "";
  body.style.top = saved.top ?? "";
  body.style.width = saved.width ?? "";
  body.style.paddingRight = saved.paddingRight ?? "";
  body.style.overflow = saved.overflow ?? "";
  document.documentElement.style.removeProperty("--lock-gutter");

  // Jump back without smooth-scrolling through the whole page.
  window.scrollTo({ top: savedY, behavior: "instant" as ScrollBehavior });
}

export default function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    lock();
    return release;
  }, [active]);
}
