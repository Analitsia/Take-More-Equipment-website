"use client";

import { useMemo, useState } from "react";
import Subheading from "./Subheading";
import EquipmentCard from "./EquipmentCard";
import FilterPanel from "./FilterPanel";
import {
  SORTS,
  applyFilters,
  applySort,
  countActive,
  emptyFilters,
  type Filters,
  type SortId,
} from "@/data/filters";

export default function Catalogue({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: (next: Filters) => void;
}) {
  const [sort, setSort] = useState<SortId>("featured");

  const results = useMemo(
    () => applySort(applyFilters(filters), sort),
    [filters, sort]
  );
  const activeCount = countActive(filters);

  return (
    <section id="catalogue" className="py-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto scroll-mt-6">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <Subheading text="The Catalogue" />
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight">
            Every Unit On The Floor
          </h2>
        </div>
        <p className="text-muted font-light text-sm leading-relaxed max-w-sm">
          One of each, priced individually. When a unit sells it stays listed with its
          price, so you can see what things actually go for.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <FilterPanel
          filters={filters}
          setFilters={setFilters}
          resultCount={results.length}
          activeCount={activeCount}
          onClear={() => setFilters(emptyFilters)}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4 pb-6 mb-6 border-b border-border">
            <span className="text-sm font-light text-muted">
              Showing <span className="text-white">{results.length}</span> of{" "}
              {applyFilters(emptyFilters).length}
            </span>
            <div className="flex items-center gap-3">
              <iconify-icon
                icon="solar:sort-vertical-linear"
                width="16"
                height="16"
                className="text-muted"
              ></iconify-icon>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortId)}
                aria-label="Sort stock"
                className="bg-card border border-border rounded-xl px-3 py-2 text-sm font-light text-white/90 hover:border-white/20 focus:border-accent focus:outline-none transition-colors cursor-pointer"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
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
                Stock rotates weekly and most of it never reaches this page. Clear the
                filters, or tell us what you are after and we will watch for it.
              </p>
              <button
                type="button"
                onClick={() => setFilters(emptyFilters)}
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
