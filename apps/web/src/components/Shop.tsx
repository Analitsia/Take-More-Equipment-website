"use client";

import { useState } from "react";
import Categories from "./Categories";
import Catalogue from "./Catalogue";
import { emptyFilters, type Filters } from "@/data/filters";
import type { Equipment, Vocabulary } from "@/data/equipment";

/**
 * Owns the catalogue filter state so the category tiles and the filter sidebar
 * stay in sync — clicking a tile is just another way of setting the same filter.
 *
 * The stock list arrives as a prop from the server. Filtering stays in memory:
 * at the few hundred units this business carries, the whole card projection is
 * a fraction of the page weight, and instant filtering beats a round trip per
 * checkbox.
 */
export default function Shop({
  stock,
  vocabulary,
}: {
  stock: Equipment[];
  vocabulary: Vocabulary;
}) {
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const selectCategory = (category: string) => {
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
      <Categories
        categories={vocabulary.categories}
        selected={filters.categories}
        onSelect={selectCategory}
      />
      <Catalogue
        stock={stock}
        vocabulary={vocabulary}
        filters={filters}
        setFilters={setFilters}
      />
    </>
  );
}
