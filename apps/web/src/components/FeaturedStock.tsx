import Subheading from "./Subheading";
import HighlightsTrack from "./HighlightsTrack";
import type { Equipment } from "@/data/equipment";

// Featured Stock Section — the template's FeaturedModels, rebuilt around items.
export default function FeaturedStock({ items }: { items: Equipment[] }) {
  return (
    <section id="stock" className="py-14 md:py-24 overflow-hidden scroll-mt-24">
      <div className="px-6 md:px-12 w-full max-w-[1440px] mx-auto mb-8 md:mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <Subheading text="In The Warehouse" />
          <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight">
            This Week&apos;s Highlights
          </h2>
        </div>
        <a
          href="#catalogue"
          className="hidden md:inline-flex items-center space-x-3 text-sm font-light hover:text-accent transition-colors pb-2 border-b border-white/10 hover:border-accent"
        >
          <span>See All Stock</span>
          <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
        </a>
      </div>

      <HighlightsTrack items={items} />
    </section>
  );
}
