"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Type, wait, ask, and ignore the answer to a question you no longer have.
 *
 * Extracted from GlobalSearch rather than copied into the order screen's
 * picker. The debounce is the obvious half and the boring one; the monotonic
 * ticket is the half worth having once.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────
 *
 * Somebody types "fry" and then "fryer". Two requests are now in flight. The
 * first one is a broader query, so it is slower, and it lands SECOND — and the
 * list on screen becomes the results for "fry" while the box says "fryer". It
 * is intermittent, it depends on the warehouse's signal, and it looks like the
 * search being wrong rather than late.
 *
 * Every call takes a ticket, and only the holder of the newest one is allowed
 * to write to state. A superseded response is dropped on arrival.
 */

const DEBOUNCE_MS = 180;
const MIN_QUERY = 2;

export function useLiveSearch<T>(
  query: string,
  fetcher: (term: string) => Promise<T[]>
): { hits: T[]; loading: boolean; tooShort: boolean } {
  const [hits, setHits] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  const term = query.trim();
  const tooShort = term.length < MIN_QUERY;

  useEffect(() => {
    if (tooShort) {
      setHits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ticket = ++latest.current;

    const timer = setTimeout(async () => {
      let rows: T[] = [];
      try {
        rows = await fetcher(term);
      } catch {
        // A refusal or a dropped connection. An empty list and no spinner says
        // "nothing matched", which is wrong but harmless and recoverable by
        // typing another character; an unhandled rejection in a search box is
        // an error overlay over a warehouse screen.
        rows = [];
      }
      // Out of order, or superseded while in flight. Drop it.
      if (ticket !== latest.current) return;
      setHits(rows);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `fetcher` is deliberately not a dependency: callers define it inline, so
    // depending on it would re-run this on every render of the parent and turn
    // a debounced search into an unthrottled one. `term` is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, tooShort]);

  return { hits, loading, tooShort };
}
