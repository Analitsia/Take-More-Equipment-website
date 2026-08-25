/**
 * The shape of the Orders page while the list is on the way: the eyebrow and
 * header, the filter chips, then the stack of order cards.
 */
export default function Loading() {
  return (
    <div className="max-w-5xl animate-pulse" aria-busy="true" aria-label="Loading orders">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-5 h-1 rounded-full bg-accent/60" />
        <div className="h-3 w-16 rounded bg-white/[0.05]" />
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="h-7 w-36 rounded-lg bg-white/[0.06]" />
          <div className="h-4 w-56 rounded bg-white/[0.04] mt-2" />
        </div>
        <div className="h-10 w-28 rounded-xl bg-white/[0.05]" />
      </header>

      <div className="flex gap-2 mb-4">
        {[0, 1, 2, 3].map((chip) => (
          <div key={chip} className="h-9 w-24 rounded-xl bg-card border border-border" />
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="h-24 rounded-2xl bg-card border border-border" />
        ))}
      </div>
    </div>
  );
}
