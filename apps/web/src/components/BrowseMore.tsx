import { getStock, getVocabulary } from "@/lib/stock";
import ContinueBrowsing from "./ContinueBrowsing";

/** Uses the same public, tagged stock cache as the homepage. */
export default async function BrowseMore({ excludeSlug }: { excludeSlug?: string }) {
  const stock = await getStock();
  const vocabulary = await getVocabulary(stock);
  return <ContinueBrowsing stock={stock} vocabulary={vocabulary} excludeFeaturedSlug={excludeSlug} />;
}
