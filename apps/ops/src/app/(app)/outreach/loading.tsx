/**
 * The shape of the Outreach page while the queue is on the way: header, then
 * the stack of suggestion cards.
 */
export default function Loading() {
  return (
    <div className="max-w-4xl animate-pulse" aria-busy="true" aria-label="Loading outreach">
      <header className="mb-5">
        <div className="h-7 w-32 rounded-lg bg-white/[0.06]" />
        <div className="h-4 w-72 rounded bg-white/[0.04] mt-2" />
      </header>

      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="h-40 rounded-2xl bg-card border border-border" />
        ))}
      </div>
    </div>
  );
}
