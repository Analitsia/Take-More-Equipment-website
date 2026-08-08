"use client";

import { useMemo, useState } from "react";

/**
 * The storefront in a frame.
 *
 * Three things earn their place in the toolbar and nothing else does:
 *
 *   Pages — the storefront's own top-level routes, so getting to the page you
 *   just changed is a tap rather than a scroll through somebody's homepage.
 *
 *   Refresh — the storefront renders statically and caches hard (that is most
 *   of why it is fast), so "I published it and it still looks old" is the
 *   obvious first confusion. Refresh changes the URL as well as reloading it,
 *   which means the CDN cannot answer from the copy it already has.
 *
 *   Phone / Desk — most customers arrive on a phone, and a photo that works on
 *   a laptop can still be unreadable at 390px. Checking that should not require
 *   owning two devices.
 *
 * The frame shows another origin, so we cannot read where it has navigated to
 * or reach into it — every control here works by pointing it somewhere new.
 * That is also why "Open in a new tab" stays visible: it is the way out if the
 * site ever refuses to be framed.
 */

const PAGES = [
  { path: "/", label: "Home" },
  { path: "/#catalogue", label: "Stock" },
  { path: "/wanted", label: "Wanted" },
  { path: "/blog", label: "Journal" },
  { path: "/about", label: "About" },
  { path: "/delivery", label: "Delivery" },
  { path: "/conditions", label: "Condition" },
];

type Device = "phone" | "desk";

export default function SitePreview({ origin }: { origin: string }) {
  const [path, setPath] = useState(PAGES[0].path);
  const [device, setDevice] = useState<Device>("desk");
  const [loading, setLoading] = useState(true);
  // Bumped by every control that should cause a fetch. Without it, asking for
  // the page you are already on is a no-op — and after you have clicked around
  // inside the frame, the page you are already on is not the one we last set.
  const [nonce, setNonce] = useState(0);

  const src = useMemo(() => {
    const url = new URL(path, origin);
    url.searchParams.set("preview", String(nonce));
    return url.toString();
  }, [origin, path, nonce]);

  /** The address a customer would use — no cache-busting query on it. */
  const publicUrl = new URL(path, origin).toString();

  function go(to: string) {
    setLoading(true);
    setPath(to);
    setNonce((n) => n + 1);
  }

  return (
    <>
      {/* Pages. Scrolls sideways on a phone rather than wrapping into three
          rows and pushing the site itself off the screen. */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0 pb-1">
        {PAGES.map((page) => {
          const current = page.path === path;
          return (
            <button
              key={page.path}
              type="button"
              onClick={() => go(page.path)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-light border transition-colors ${
                current
                  ? "bg-accent text-background border-accent font-medium"
                  : "border-border text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              {page.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-3 mb-3">
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setNonce((n) => n + 1);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5
                     text-xs font-light text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          <iconify-icon icon="solar:refresh-linear" width="14" height="14" noobserver="" />
          Refresh
        </button>

        <div className="flex items-center rounded-xl border border-border p-0.5">
          {(
            [
              { key: "phone", icon: "solar:smartphone-linear", label: "Phone" },
              { key: "desk", icon: "solar:monitor-linear", label: "Desk" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setDevice(option.key)}
              aria-label={option.label}
              aria-pressed={device === option.key}
              className={`rounded-[10px] px-2.5 py-1 transition-colors ${
                device === option.key
                  ? "bg-white/10 text-white"
                  : "text-muted hover:text-white"
              }`}
            >
              <iconify-icon icon={option.icon} width="15" height="15" noobserver="" />
            </button>
          ))}
        </div>

        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-light text-muted
                     hover:text-accent transition-colors"
        >
          New tab
          <iconify-icon icon="solar:arrow-right-up-linear" width="13" height="13" noobserver="" />
        </a>
      </div>

      <div
        className={`relative rounded-2xl border border-border overflow-hidden bg-card/30
                    h-[68dvh] md:h-[calc(100dvh-15rem)] md:min-h-[420px] transition-[max-width] duration-200 ${
                      device === "phone" ? "max-w-[390px] mx-auto" : "max-w-none"
                    }`}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <span className="text-[11px] font-light text-muted animate-pulse">Loading…</span>
          </div>
        )}
        <iframe
          src={src}
          title="Take More website"
          onLoad={() => setLoading(false)}
          className="w-full h-full bg-white"
        />
      </div>

      <p className="text-[11px] font-light text-muted mt-2">
        {/* Nothing here can tell a blocked frame apart from a slow one — a
            cross-origin frame reports neither — so rather than guess at an
            error we keep the way out in plain sight. */}
        Blank or stuck? <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="text-white/70 hover:text-accent transition-colors underline underline-offset-2"
        >
          Open it in a new tab
        </a>. Just published something and still seeing the old version? Refresh.
      </p>
    </>
  );
}
