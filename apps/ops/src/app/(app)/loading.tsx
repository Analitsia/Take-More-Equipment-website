/**
 * What a tap shows while the server is still thinking.
 *
 * Every page in this group is rendered per request — the data is live stock
 * and live customers, so that part is not negotiable — which used to mean a
 * sidebar tap changed nothing on screen until the whole round trip to the
 * database came back. On warehouse wifi that reads as "the app ignored me",
 * and the second tap it provokes is how the same navigation gets paid for
 * twice.
 *
 * This boundary is what makes the tap land instantly instead: Next.js swaps
 * the old page for this skeleton the moment the navigation starts, then
 * streams the real page into it. It also gives <Link> prefetching something
 * it is allowed to prefetch for a dynamic route, which is what makes the
 * transition start from memory rather than from a network request.
 *
 * Deliberately generic — header, toolbar, a stack of cards — because it
 * stands in for every destination in the group. It borrows the exact surface
 * classes the real pages use (bg-card, border-border, rounded-2xl) so the
 * page appears to fill in rather than appear.
 */
export default function Loading() {
  return (
    <div className="max-w-6xl animate-pulse" aria-busy="true" aria-label="Loading">
      <header className="mb-6">
        <div className="h-7 w-44 rounded-lg bg-white/[0.06]" />
        <div className="h-4 w-64 rounded bg-white/[0.04] mt-2" />
      </header>

      <div className="h-11 w-40 rounded-xl bg-white/[0.05] mb-6" />

      <div className="flex flex-col gap-3">
        <div className="h-24 rounded-2xl bg-card border border-border" />
        <div className="h-24 rounded-2xl bg-card border border-border" />
        <div className="h-56 rounded-2xl bg-card border border-border" />
      </div>
    </div>
  );
}
