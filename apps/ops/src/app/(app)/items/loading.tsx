/**
 * The shape of the Stock page, painted the instant the tap lands.
 *
 * Mirrors ItemsBrowser: header, the search row, then the board columns — so
 * the real page fills this in rather than replacing it. Same surface classes
 * as everywhere else (bg-card, border-border, rounded-2xl).
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading stock">
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="h-7 w-24 rounded-lg bg-white/[0.06]" />
          <div className="h-4 w-56 rounded bg-white/[0.04] mt-2" />
        </div>
        <div className="h-10 w-28 rounded-xl bg-white/[0.05]" />
      </header>

      <div className="flex flex-col sm:flex-row gap-3 mb-4 max-w-3xl">
        <div className="h-11 flex-1 rounded-xl bg-card border border-border" />
        <div className="h-11 w-28 rounded-xl bg-card border border-border" />
      </div>

      <div className="flex gap-3 overflow-hidden pb-2">
        {[0, 1, 2, 3].map((column) => (
          <div
            key={column}
            className="w-[78vw] sm:w-72 shrink-0 lg:w-auto lg:flex-1 lg:shrink lg:min-w-0
                       lg:max-w-[26rem] h-[60vh] bg-card/50 border border-border rounded-2xl"
          />
        ))}
      </div>
    </div>
  );
}
