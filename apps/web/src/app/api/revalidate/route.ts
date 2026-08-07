import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { STOCK_TAG } from "@/lib/stock";

/**
 * Drop the storefront's stock cache.
 *
 * Called by the ops app whenever an item is published, repriced, moved or has
 * a photo added. That is what makes "publish it and it's on the site in
 * seconds" true while the pages themselves stay static and fast.
 *
 * Authenticated with a shared secret rather than a signature: the payload
 * carries nothing sensitive and the worst an attacker can do with it is make
 * the site rebuild a cache entry it was going to rebuild anyway. A timing-safe
 * comparison is still used, because a cheap habit is better than a cheap
 * excuse.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const provided = request.headers.get("x-revalidate-secret") ?? "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  // One tag covers the catalogue, the highlights row, the category counts and
  // every detail page, because they are all views of the same cached query.
  // Finer-grained tags would be a saving worth making at a much larger
  // catalogue; here it would only be a way to forget one.
  revalidateTag(STOCK_TAG);

  // The homepage and detail pages render from that tag, but the search index
  // route has its own CDN cache entry.
  revalidatePath("/api/catalogue");

  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}

/**
 * A GET form so the loop can be tested from a browser, and so an uptime check
 * can hold the cache warm. Same secret, passed as a query parameter.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const provided = request.nextUrl.searchParams.get("secret") ?? "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  revalidateTag(STOCK_TAG);
  revalidatePath("/api/catalogue");
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
