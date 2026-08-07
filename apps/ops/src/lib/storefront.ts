import "server-only";

/**
 * Tell the storefront that stock changed.
 *
 * The public site renders statically and caches aggressively, which is most of
 * why it is fast. This is the counterweight: a publish, a price change or a new
 * photo pings a route handler on the storefront, which drops the relevant cache
 * tags so the next visitor gets the new version.
 *
 * Fire-and-forget on purpose. A worker publishing an item should not wait on
 * another deployment's HTTP round trip, and should certainly not see an error
 * because the storefront was briefly slow — the site self-heals through its own
 * time-based revalidation regardless. Failures are logged, not raised.
 */
export async function revalidateStorefront(itemId?: string): Promise<void> {
  const base = process.env.STOREFRONT_URL;
  const secret = process.env.REVALIDATE_SECRET;

  // Not configured (local development, or before the storefront is deployed).
  // Silently skip rather than noisily fail.
  if (!base || !secret) return;

  try {
    await fetch(`${base.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ itemId }),
      cache: "no-store",
      // The storefront's cache is not worth blocking an intake flow on.
      signal: AbortSignal.timeout(4000),
    });
  } catch (error) {
    console.warn("storefront revalidation failed (it will self-heal):", error);
  }
}
