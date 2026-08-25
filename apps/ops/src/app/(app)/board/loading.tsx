/**
 * The shape of the Board, painted the instant the tap lands: header, then the
 * four workshop columns the real StockBoard streams into.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading board">
      <header className="mb-5">
        <div className="h-7 w-24 rounded-lg bg-white/[0.06]" />
        <div className="h-4 w-72 rounded bg-white/[0.04] mt-2" />
      </header>

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
