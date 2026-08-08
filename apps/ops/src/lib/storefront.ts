import "server-only";

/**
 * Where the storefront lives, for looking at rather than for linking to.
 *
 * Same chain the outbound links use (see `itemUrl` in lib/message), with one
 * difference at the end: with nothing configured this answers localhost:3000,
 * because in development the storefront is a second dev server rather than a
 * domain. A message going to a customer must never guess that way — a frame we
 * are looking at ourselves is the one place where guessing is the right answer.
 */
export function storefrontOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_STOREFRONT_URL ?? process.env.STOREFRONT_URL;
  if (configured) return configured.replace(/\/$/, "");
  return process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://takemoreequipment.co.za";
}

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
