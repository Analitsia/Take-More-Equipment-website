"use client";

import { useMemo } from "react";
import { MAX_FEATURED, type Segment } from "@takemore/core";
import type { Equipment, Vocabulary } from "@/data/equipment";

/** Keep homepage and onward browsing filters in step, including shared items. */
export function useSegmentStock(stock: Equipment[], vocabulary: Vocabulary, segment: Segment) {
  return useMemo(() => {
    const selectedStock = stock.filter(item => item.segments.includes(segment));
    const counts = new Map<string, number>();
    for (const item of selectedStock) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    const scopedVocabulary = {
      ...vocabulary,
      divisions: vocabulary.divisions.filter(d => d.slug === segment).map(d => ({ ...d, count: selectedStock.length })),
      categories: vocabulary.categories.filter(c => c.divisionSlug === segment || counts.has(c.name))
        .map(c => ({ ...c, divisionSlug: segment, count: counts.get(c.name) ?? 0 })),
      tags: vocabulary.tags.filter(tag => selectedStock.some(item => item.tags.includes(tag))),
    };
    return { selectedStock, scopedVocabulary, featured: selectedStock.filter(item => item.featured).slice(0, MAX_FEATURED) };
  }, [stock, vocabulary, segment]);
}
