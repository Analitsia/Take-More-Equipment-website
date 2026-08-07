import { NextResponse } from "next/server";
import { getStock, getVocabulary } from "@/lib/stock";

/**
 * The index behind the search and menu overlays.
 *
 * Both live inside the navbar, which is on every page including the blog and
 * the policy pages — so threading the full catalogue into them as props would
 * mean every page paying for data most visitors never open. Fetching on first
 * open instead costs one request, only from people who actually search.
 *
 * Lean on purpose: the six fields a result row renders, nothing else.
 */
export async function GET() {
  const stock = await getStock();
  const vocabulary = await getVocabulary(stock);

  return NextResponse.json(
    {
      categories: vocabulary.categories,
      items: stock.map((item) => ({
        slug: item.slug,
        title: item.title,
        brand: item.brand,
        category: item.category,
        grade: item.grade,
        price: item.price,
        image: item.images[0] ?? null,
        sold: !!item.sold,
        tags: item.tags,
      })),
    },
    {
      // Shares the storefront's own revalidation window; a publish drops the
      // underlying cache tag and this follows on the next request.
      headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" },
    }
  );
}
