/**
 * The shape of the Team page while the roster and the activity log are on the
 * way: header, the roster card, then a day of activity rows.
 */
export default function Loading() {
  return (
    <div className="max-w-3xl animate-pulse" aria-busy="true" aria-label="Loading team">
      <header className="mb-6">
        <div className="h-7 w-24 rounded-lg bg-white/[0.06]" />
        <div className="h-4 w-64 rounded bg-white/[0.04] mt-2" />
      </header>

      <div className="h-48 rounded-2xl bg-card border border-border mb-6" />

      <div className="h-3 w-20 rounded bg-white/[0.05] mb-2 mx-1" />
      <div className="flex flex-col gap-0 rounded-2xl bg-card border border-border overflow-hidden">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="h-14 border-b border-white/5 last:border-b-0" />
        ))}
      </div>
    </div>
  );
}
