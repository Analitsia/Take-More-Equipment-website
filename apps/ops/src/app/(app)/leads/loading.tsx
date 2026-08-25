/**
 * The shape of the Clients page while the list is on the way: header, search,
 * then the stack of person cards LeadsBrowser renders.
 */
export default function Loading() {
  return (
    <div className="max-w-5xl animate-pulse" aria-busy="true" aria-label="Loading clients">
      <div className="mb-5">
        <div className="h-7 w-32 rounded-lg bg-white/[0.06]" />
        <div className="h-4 w-64 rounded bg-white/[0.04] mt-2" />
      </div>

      <div className="h-11 max-w-3xl rounded-xl bg-card border border-border mb-4" />

      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="h-20 rounded-2xl bg-card border border-border" />
        ))}
      </div>
    </div>
  );
}
