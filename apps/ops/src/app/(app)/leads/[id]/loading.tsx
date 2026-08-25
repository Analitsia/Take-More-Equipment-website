/**
 * The shape of a client's page while their record is on the way: the back
 * link, then the editor's stack of panels.
 */
export default function Loading() {
  return (
    <div className="max-w-4xl animate-pulse" aria-busy="true" aria-label="Loading client">
      <div className="h-4 w-20 rounded bg-white/[0.05] mb-5" />

      <div className="flex flex-col gap-3">
        <div className="h-40 rounded-2xl bg-card border border-border" />
        <div className="h-56 rounded-2xl bg-card border border-border" />
        <div className="h-40 rounded-2xl bg-card border border-border" />
      </div>
    </div>
  );
}
