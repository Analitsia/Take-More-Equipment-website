/**
 * The shape of an order's page while it is on the way: the back link, then the
 * screen's stack of panels — lines, payment, delivery, invoice.
 */
export default function Loading() {
  return (
    <div className="max-w-5xl animate-pulse" aria-busy="true" aria-label="Loading order">
      <div className="h-4 w-16 rounded bg-white/[0.05] mb-5" />

      <div className="flex flex-col gap-3">
        <div className="h-32 rounded-2xl bg-card border border-border" />
        <div className="h-48 rounded-2xl bg-card border border-border" />
        <div className="h-40 rounded-2xl bg-card border border-border" />
        <div className="h-40 rounded-2xl bg-card border border-border" />
      </div>
    </div>
  );
}
