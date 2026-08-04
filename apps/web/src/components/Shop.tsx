"use client";

import { useState } from "react";
import Categories from "./Categories";
import Catalogue from "./Catalogue";
import { emptyFilters, type Filters } from "@/data/filters";
import type { Category } from "@/data/equipment";

/**
 * Owns the catalogue filter state so the category tiles and the filter sidebar
 * stay in sync — clicking a tile is just another way of setting the same filter.
 */
export default function Shop() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const selectCategory = (category: Category) => {
    const alreadyOnlySelection =
      filters.categories.length === 1 && filters.categories[0] === category;

    setFilters({
      ...filters,
      categories: alreadyOnlySelection ? [] : [category],
    });

    document.getElementById("catalogue")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <>
      <Categories selected={filters.categories} onSelect={selectCategory} />
      <Catalogue filters={filters} setFilters={setFilters} />
    </>
  );
}
