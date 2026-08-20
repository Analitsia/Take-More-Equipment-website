"use client";

import { useMemo, useState } from "react";
import Subheading from "./Subheading";
import EquipmentCard from "./EquipmentCard";
import FilterPanel from "./FilterPanel";
import {
  SORTS,
  applyFilters,
  applySort,
  clearedWithin,
  countActive,
  emptyFilters,
  type Filters,
  type SortId,
} from "@/data/filters";
import { stockedDivisions, type Equipment, type Vocabulary } from "@/data/equipment";

/**
 * The whole shop: the filter sidebar and the grid it drives.
 *
 * The stock list arrives as a prop from the server. Filtering stays in memory:
 * at the few hundred units this business carries, the whole card projection is
 * a fraction of the page weight, and instant filtering beats a round trip per
 * checkbox.
 */
export default function Catalogue({
  stock,
  vocabulary,
}: {
  stock: Equipment[];
  vocabulary: Vocabulary;
}) {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sort, setSort] = useState<SortId>("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const results = useMemo(
    () => applySort(applyFilters(stock, filters), sort),
    [stock, filters, sort]
  );
  const activeCount = countActive(filters);

  /**
   * The switcher only exists when there is genuinely something to switch
   * between. One line of stock on the site means one shop, and a tab leading to
   * an empty grid is a worse answer than no tab.
   */
  const lines = useMemo(() => stockedDivisions(vocabulary), [vocabulary]);
  const showLines = lines.length > 1;

  // Switching line drops the category ticks and nothing else: they name
  // categories that do not exist on the other side, so keeping them would show
  // an empty grid. Price, condition and specification mean the same thing in
  // both, so they carry over.
  const chooseLine = (slug: string | null) =>
    setFilters({ ...filters, division: slug, categories: [] });

  // Tighter on top than the site's usual py-14/24: the highlights row above is
  // the same subject, so the two read as one stock block rather than two
  // distant sections — which is the gap the category strip used to sit in.
  return (
    <section
      id="catalogue"
      className="pt-12 pb-14 md:pb-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto scroll-mt-6"
    >
      <div className="mb-8 md:mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <Subheading text="The Catalogue" />
          <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight">
            Every Unit On The Floor
          </h2>
        </div>
        <p className="text-muted font-light text-sm leading-relaxed max-w-sm">
          One of each, every price on the card against what the same machine costs new.
          Sold units stay listed at what they went for, so you can see the real numbers
          before you spend anything.
        </p>
      </div>

      {showLines && (
        <div
          role="group"
          aria-label="Line of business"
          className="flex flex-wrap items-center gap-2 mb-6 md:mb-8"
        >
          {[{ slug: null, name: "Everything", count: stock.length }, ...lines].map((line) => {
            const on = filters.division === line.slug;
            return (
              <button
                key={line.slug ?? "all"}
                type="button"
                aria-pressed={on}
                onClick={() => chooseLine(line.slug)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-light border transition-colors ${
                  on
                    ? "border-accent/70 bg-accent/10 text-accent"
                    : "border-border text-muted hover:border-white/25 hover:text-white/80"
                }`}
              >
                {line.name}
                <span className={on ? "text-accent/70" : "text-muted/60"}>{line.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        <FilterPanel
          vocabulary={vocabulary}
          filters={filters}
          setFilters={setFilters}
          resultCount={results.length}
          activeCount={activeCount}
          onClear={() => setFilters(clearedWithin(filters))}
          open={filtersOpen}
          setOpen={setFiltersOpen}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 pb-5 mb-6 border-b border-border">
            <span className="text-xs sm:text-sm font-light text-muted">
              <span className="text-white">{results.length}</span>
              <span className="hidden sm:inline"> of {stock.length}</span>
              <span className="sm:hidden"> units</span>
            </span>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <iconify-icon
                icon="solar:sort-vertical-linear"
                width="16"
                height="16"
                className="text-muted shrink-0"
              ></iconify-icon>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortId)}
                aria-label="Sort stock"
                className="bg-card border border-border rounded-xl px-3 py-2 text-xs sm:text-sm font-light text-white/90 hover:border-white/20 focus:border-accent focus:outline-none transition-colors cursor-pointer max-w-[190px]"
              >
                {SORTS.map((option) => (
                  <option key={option.id} value={option.id} className="bg-card">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-6">
              {results.map((item) => (
                <EquipmentCard key={item.slug} {...item} variant="grid" />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-[2rem] p-12 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mb-6">
                <iconify-icon
                  icon="solar:minimalistic-magnifer-linear"
                  width="24"
                  height="24"
                ></iconify-icon>
              </div>
              <h3 className="text-xl font-medium tracking-tight mb-3">
                Nothing matches that combination
              </h3>
              <p className="text-muted font-light text-sm leading-relaxed max-w-sm mb-6">
                Stock rotates weekly and the best units go fast. Clear the filters, or tell
                us what you are after and we will find it for you.
              </p>
              <button
                type="button"
                onClick={() => setFilters(clearedWithin(filters))}
                className="inline-flex items-center gap-3 group"
              >
                <span className="text-sm font-light group-hover:text-accent transition-colors">
                  Clear filters
                </span>
                <span className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center group-hover:border-accent transition-colors">
                  <iconify-icon icon="solar:restart-linear" width="14" height="14"></iconify-icon>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
