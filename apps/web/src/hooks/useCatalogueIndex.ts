"use client";

import { useEffect, useState } from "react";

export type IndexItem = {
  slug: string;
  title: string;
  brand: string;
  category: string;
  grade: string;
  price: number;
  image: string | null;
  sold: boolean;
  tags: string[];
};

export type CatalogueIndex = {
  /** Lines of business, in the order the shop offers them. */
  divisions: { slug: string; name: string; blurb: string; count: number }[];
  categories: {
    name: string;
    icon: string;
    blurb: string;
    count: number;
    divisionSlug: string;
    division: string;
  }[];
  items: IndexItem[];
};

/**
 * The catalogue index, fetched once per page load and shared.
 *
 * The promise is memoised at module scope rather than in state, so opening
 * search, closing it and opening the menu does not fetch three times — and two
 * overlays mounted at once share one request.
 */
let cached: Promise<CatalogueIndex> | null = null;

const load = () => {
  cached ??= fetch("/api/catalogue")
    .then((r) => (r.ok ? r.json() : { divisions: [], categories: [], items: [] }))
    // A failed index should degrade to an empty overlay, never a broken page.
    .catch(() => ({ divisions: [], categories: [], items: [] }));
  return cached;
};

export default function useCatalogueIndex(): CatalogueIndex | null {
  const [index, setIndex] = useState<CatalogueIndex | null>(null);

  useEffect(() => {
    let alive = true;
    load().then((data) => {
      if (alive) setIndex(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  return index;
}
