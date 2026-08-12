"use client";

import { useMemo, useState } from "react";
import StockBoard from "./StockBoard";
import type { ItemRow } from "@/lib/queries";

/**
 * The desk-work view of stock: a search box and a "not live" filter over the
 * board.
 *
 * Search and filtering happen in memory. At the scale this business runs at —
 * hundreds of units, not hundreds of thousands — a round trip per keystroke
 * buys nothing, and instant filtering is the difference between a list you use
 * and a list you avoid.
 *
 * There is one arrangement, and it is the board. A flat list said the same
 * thing in a worse place: where a machine *is* is the question people open
 * Stock to ask, and the columns answer it before anything is read. The stage
 * filter went with the list — the columns are the stages, so filtering by one
 * would empty the other three for a reason the eye cannot see.
 */
export default function ItemsBrowser({ items }: { items: ItemRow[] }) {
  const [query, setQuery] = useState("");
  const [onlyDrafts, setOnlyDrafts] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyDrafts && item.published_at) return false;
      if (!term) return true;
      return [item.title, item.brand, item.sku, item.category?.name, item.location_code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [items, query, onlyDrafts]);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <iconify-icon
            icon="solar:magnifer-linear"
            width="16"
            height="16"
            noobserver=""
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, brand, SKU or shelf"
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm font-light
                       text-white/90 placeholder:text-muted/60 hover:border-white/20
                       focus:border-accent focus:outline-none transition-colors"
          />
        </div>

        <button
          onClick={() => setOnlyDrafts((v) => !v)}
          className={`rounded-xl px-4 py-2.5 text-sm font-light border transition-colors whitespace-nowrap ${
            onlyDrafts
              ? "border-accent/70 bg-accent/10 text-accent"
              : "border-border text-white/70 hover:border-white/25"
          }`}
        >
          Not live
        </button>
      </div>

      {/* Said out loud rather than shown as four empty columns: "Empty" under
          every stage reads as "no stock", not "your search matched nothing". */}
      {filtered.length === 0 ? (
        <p className="text-sm font-light text-muted py-10 text-center">
          Nothing matches that.
        </p>
      ) : (
        <StockBoard items={filtered} />
      )}
    </>
  );
}
