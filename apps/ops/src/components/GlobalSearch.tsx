"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@takemore/db";

/**
 * One box for the whole app.
 *
 * Somebody at the counter has a machine in their hands and a person in front of
 * them. Which list the answer is in — Stock or Clients — is our filing problem,
 * not theirs. This searches both, and it opens on ⌘K / Ctrl-K or a tap on the
 * magnifier in the header.
 *
 * The query goes to search_everything(), which is SECURITY INVOKER — so every
 * RLS policy applies exactly as it would to a direct query, and this cannot
 * become a way around one that gets tightened later.
 *
 * Debounced at 180ms: fast enough to feel live while typing, slow enough that a
 * six-letter word is one request rather than six. Requests are sequenced too —
 * a slow response for "fry" must not land after a fast one for "fryer" and
 * overwrite it, which is the classic bug in every search box like this.
 */

type Hit = {
  kind: "item" | "lead";
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
};

const MIN_QUERY = 2;
const DEBOUNCE_MS = 180;

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);

  /** Monotonic request id. Anything but the newest response is discarded. */
  const latest = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setCursor(0);
  }, []);

  // ⌘K / Ctrl-K from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((was) => !was);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY) {
      setHits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      const client = createBrowserClient();
      const { data } = await client.rpc("search_everything", { p_query: term, p_limit: 12 });
      // Out of order, or superseded while in flight. Drop it.
      if (ticket !== latest.current) return;
      setHits((data ?? []) as Hit[]);
      setCursor(0);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const go = useCallback(
    (hit: Hit) => {
      close();
      router.push(hit.kind === "item" ? `/items/${hit.id}` : `/leads/${hit.id}`);
    },
    [close, router]
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search stock and clients"
        className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted hover:text-white hover:border-white/25 transition-colors"
      >
        <iconify-icon icon="solar:magnifer-linear" width="16" height="16"></iconify-icon>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Search stock and clients"
        className="w-9 h-9 rounded-xl border border-accent/40 text-accent flex items-center justify-center"
      >
        <iconify-icon icon="solar:magnifer-linear" width="16" height="16"></iconify-icon>
      </button>

      <div
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="bg-card border border-border rounded-2xl w-full max-w-lg overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <span className="text-muted shrink-0 flex items-center">
              <iconify-icon icon="solar:magnifer-linear" width="16" height="16"></iconify-icon>
            </span>
            <input
              ref={input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") close();
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setCursor((c) => Math.min(c + 1, hits.length - 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                }
                if (event.key === "Enter" && hits[cursor]) {
                  event.preventDefault();
                  go(hits[cursor]);
                }
              }}
              placeholder="A machine, a SKU, a name, a number…"
              className="flex-1 bg-transparent text-sm font-light text-white/90 placeholder:text-muted/70 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="text-[10px] font-light text-muted border border-border rounded px-1.5 py-0.5 shrink-0"
            >
              esc
            </button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto">
            {query.trim().length < MIN_QUERY && (
              <p className="px-4 py-6 text-xs font-light text-muted text-center">
                Type at least two characters.
              </p>
            )}

            {query.trim().length >= MIN_QUERY && !loading && hits.length === 0 && (
              <p className="px-4 py-6 text-xs font-light text-muted text-center">
                Nothing matches that.
              </p>
            )}

            {hits.map((hit, index) => (
              <button
                key={`${hit.kind}-${hit.id}`}
                type="button"
                onClick={() => go(hit)}
                onMouseEnter={() => setCursor(index)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                  index === cursor ? "bg-white/[0.04]" : ""
                }`}
              >
                <span
                  className={`w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center ${
                    hit.kind === "item"
                      ? "border-border text-muted"
                      : "border-accent/30 text-accent"
                  }`}
                >
                  <iconify-icon
                    icon={hit.kind === "item" ? "solar:box-linear" : "solar:user-linear"}
                    width="14"
                    height="14"
                  ></iconify-icon>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-light truncate">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="block text-[11px] font-light text-muted truncate">
                      {hit.subtitle}
                    </span>
                  )}
                </span>
                {hit.badge && (
                  <span className="text-[10px] font-light text-muted shrink-0">
                    {hit.badge.replace(/_/g, " ")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
