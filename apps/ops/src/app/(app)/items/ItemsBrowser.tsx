"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ITEM_STATUSES, STATUS_LABELS, rands, type ItemStatus } from "@takemore/core";
import { StatusPill, PublishPill } from "@takemore/ui";
import { mediaUrl } from "@/lib/media";
import type { ItemRow } from "@/lib/queries";

/**
 * The desk-work view of stock.
 *
 * Search and filtering happen in memory. At the scale this business runs at —
 * hundreds of units, not hundreds of thousands — a round trip per keystroke
 * buys nothing, and instant filtering is the difference between a list you use
 * and a list you avoid.
 */
export default function ItemsBrowser({ items }: { items: ItemRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ItemStatus | "all">("all");
  const [onlyDrafts, setOnlyDrafts] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (onlyDrafts && item.published_at) return false;
      if (!term) return true;
      return [item.title, item.brand, item.sku, item.category?.name, item.location_code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [items, query, status, onlyDrafts]);

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

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ItemStatus | "all")}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm font-light text-white/90
                     hover:border-white/20 focus:border-accent focus:outline-none transition-colors"
        >
          <option value="all">Every status</option>
          {ITEM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

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

      {filtered.length === 0 ? (
        <p className="text-sm font-light text-muted py-10 text-center">
          Nothing matches that.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => {
            const image = item.media?.length ? mediaUrl(item.media[0], "card") : null;
            return (
              <li key={item.id}>
                <Link
                  href={`/items/${item.id}`}
                  className="flex items-center gap-3 sm:gap-4 bg-card border border-border rounded-2xl
                             p-3 hover:border-white/15 transition-colors group"
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-background border border-border shrink-0">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={image}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted">
                        <iconify-icon icon="solar:camera-linear" width="18" height="18" noobserver="" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium tracking-tight truncate">
                        {item.title}
                      </h3>
                      {item.featured && (
                        <iconify-icon
                          icon="solar:star-bold"
                          width="12"
                          height="12"
                          noobserver=""
                          className="text-accent shrink-0"
                        />
                      )}
                    </div>
                    <p className="text-[11px] font-light text-muted truncate">
                      {[item.sku, item.brand, item.category?.name, item.location_code]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <StatusPill status={item.status} size="sm" />
                      <PublishPill publishedAt={item.published_at} />
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium tracking-tight whitespace-nowrap">
                      {item.list_price_cents ? rands(item.list_price_cents) : "—"}
                    </p>
                    {item.condition_grade && (
                      <p className="text-[11px] font-light text-muted mt-0.5">
                        Grade {item.condition_grade}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
