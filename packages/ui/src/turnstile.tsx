"use client";

import { useEffect, useRef } from "react";

/**
 * The Cloudflare Turnstile widget.
 *
 * Hand-rolled rather than pulling in a wrapper package: it is a script tag and
 * a div, and the wrapper would be a dependency to keep current for no gain.
 *
 * The site key is a PROP, not read from the environment here — @takemore/ui
 * has no environment of its own and both apps pass their own. It is a public
 * value; the secret half never leaves the server (see
 * @takemore/core/turnstile).
 *
 * Renders nothing when no site key is passed, so local development and CI —
 * where Turnstile is deliberately not configured — get a form with no gap in it.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

/** One script for the page, however many widgets ask for it. */
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
    });
  }

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    // Resolve on failure too. A blocked script must leave the form usable —
    // the server decides whether a submission is accepted, and it will say so
    // in words rather than the button silently doing nothing.
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(script);
  });
}

export type TurnstileHandle = { reset: () => void };

export default function Turnstile({
  siteKey,
  onToken,
  resetKey,
  className,
}: {
  /** NEXT_PUBLIC_TURNSTILE_SITE_KEY. Undefined renders nothing. */
  siteKey?: string;
  /**
   * Called with the token when the challenge passes, and with null when it
   * expires or errors. Only needed by forms that submit via onSubmit — a plain
   * `<form action={...}>` picks the token up from the hidden input the widget
   * writes, with no wiring at all.
   */
  onToken?: (token: string | null) => void;
  /**
   * Change this to force a fresh challenge. A Turnstile token is single-use,
   * so a form that stays mounted across two submissions — or one that switches
   * between a sign-in and a request mode — must reset between them or the
   * second submission replays a spent token and is rejected.
   */
  resetKey?: string | number;
  className?: string;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  // Kept in a ref so re-rendering with a new callback does not tear down and
  // rebuild the widget, which would make the person solve it again.
  const handler = useRef(onToken);
  handler.current = onToken;

  useEffect(() => {
    if (!siteKey || !holder.current) return;

    let cancelled = false;
    const element = holder.current;

    loadScript().then(() => {
      if (cancelled || !window.turnstile || !element) return;
      element.innerHTML = "";
      widgetId.current = window.turnstile.render(element, {
        sitekey: siteKey,
        theme: "dark",
        // The widget writes <input name="cf-turnstile-response">, which is what
        // makes a plain server-action form work with no JavaScript of ours.
        "response-field-name": "cf-turnstile-response",
        callback: (token: string) => handler.current?.(token),
        "expired-callback": () => handler.current?.(null),
        "error-callback": () => handler.current?.(null),
      });
    });

    return () => {
      cancelled = true;
      try {
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      } catch {
        // Already gone with the DOM node. Nothing to do, and an exception in a
        // cleanup function would surface as an unrelated React error.
      }
      widgetId.current = null;
    };
  }, [siteKey, resetKey]);

  if (!siteKey) return null;

  return <div ref={holder} className={className} />;
}
