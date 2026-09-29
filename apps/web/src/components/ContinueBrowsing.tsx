"use client";

import type { Equipment, Vocabulary } from "@/data/equipment";
import { useSegment } from "./SegmentProvider";
import { useSegmentStock } from "./useSegmentStock";
import SegmentSwitcher from "./SegmentSwitcher";
import FeaturedStock from "./FeaturedStock";
import Catalogue from "./Catalogue";
import Subheading from "./Subheading";

export default function ContinueBrowsing({ stock, vocabulary, excludeFeaturedSlug }: { stock: Equipment[]; vocabulary: Vocabulary; excludeFeaturedSlug?: string }) {
  const { segment } = useSegment();
  const { selectedStock, scopedVocabulary, featured } = useSegmentStock(stock, vocabulary, segment);
  const highlights = featured.filter(item => item.slug !== excludeFeaturedSlug);
  return <section aria-label="Keep exploring" className="border-t border-border pt-12 md:pt-16 mt-12 md:mt-16">
    <div className="w-full max-w-[1440px] mx-auto px-6 md:px-12">
      <Subheading text="Keep Exploring" />
      <h2 className="text-2xl md:text-4xl font-medium tracking-tight">Your next find could be here.</h2>
      <p className="text-sm text-muted font-light mt-4 max-w-xl">Explore the latest arrivals, find a favourite and come see it in the warehouse.</p>
    </div>
    <SegmentSwitcher />
    <div data-segment-surface>{highlights.length > 0 && <FeaturedStock items={highlights} />}</div>
    <div data-segment-surface><Catalogue key={segment} stock={selectedStock} vocabulary={scopedVocabulary} segment={segment} /></div>
  </section>;
}
