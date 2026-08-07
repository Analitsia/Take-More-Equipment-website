import Link from "next/link";
import { listItems } from "@/lib/queries";
import { requireStaff } from "@/lib/supabase";
import { STATUS_LABELS, isOnHand, rands, canSeeCosts, type ItemStatus } from "@takemore/core";
import { STATUS_CLASSES } from "@takemore/ui";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Today.
 *
 * Deliberately small. A dashboard that answers five questions well is used; one
 * that answers thirty is scrolled past. The full KPI set — days-to-sale,
 * sell-through, margin by category — comes once there is enough history for the
 * numbers to mean anything.
 */
export default async function DashboardPage() {
  const staff = await requireStaff();
  const items = await listItems();

  const byStatus = new Map<ItemStatus, number>();
  for (const item of items) {
    byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);
  }

  const live = items.filter((i) => i.published_at).length;
  const onHand = items.filter((i) => isOnHand(i.status));
  const askingTotal = onHand.reduce((sum, i) => sum + (i.list_price_cents ?? 0), 0);

  const weekAgo = Date.now() - 7 * 86_400_000;
  const publishedThisWeek = items.filter(
    (i) => i.published_at && new Date(i.published_at).getTime() > weekAgo
  ).length;

  // Oldest unsold unit — the one quietly costing shelf space.
  const oldest = [...onHand]
    .filter((i) => i.status !== "sold")
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))[0];

  let costTotal: number | null = null;
  if (canSeeCosts(staff.role)) {
    const client = await supabase();
    const { data } = await client.from("item_economics").select("total_cost_cents");
    costTotal = (data ?? []).reduce(
      (sum, row: any) => sum + Number(row.total_cost_cents ?? 0),
      0
    );
  }

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">
          Afternoon, {staff.fullName.split(" ")[0]}
        </h1>
        <p className="text-sm font-light text-muted mt-1">
          {items.length === 0
            ? "No stock yet. Take in the first machine."
            : `${onHand.length} on hand · ${live} live on the site`}
        </p>
      </header>

      {items.length === 0 ? (
        <Link
          href="/items/new"
          className="block bg-card border border-border rounded-2xl p-10 text-center hover:border-white/15 transition-colors"
        >
          <div className="w-12 h-12 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mx-auto mb-4">
            <iconify-icon icon="solar:add-circle-linear" width="22" height="22" noobserver="" />
          </div>
          <p className="text-base font-medium tracking-tight mb-1">Take in your first item</p>
          <p className="text-sm font-light text-muted">
            Photograph it, price it, publish it.
          </p>
        </Link>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat label="On hand" value={String(onHand.length)} />
            <Stat label="Live on site" value={String(live)} accent />
            <Stat label="Published this week" value={String(publishedThisWeek)} />
            <Stat
              label={costTotal === null ? "Stock at asking" : "Stock value"}
              value={rands(askingTotal)}
              sub={costTotal === null ? undefined : `${rands(costTotal)} at cost`}
            />
          </div>

          <section className="bg-card border border-border rounded-2xl p-5 mb-4">
            <h2 className="text-sm font-medium tracking-tight mb-4">Where everything is</h2>
            <ul className="space-y-2">
              {[...byStatus.entries()].map(([status, count]) => (
                <li key={status}>
                  <Link
                    href="/board"
                    className="flex items-center gap-3 group"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_CLASSES[status].dot}`} />
                    <span className="text-sm font-light text-white/80 group-hover:text-white transition-colors">
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="flex-1 h-px bg-white/5" />
                    <span className="text-sm font-light tabular-nums">{count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {oldest && (
            <Link
              href={`/items/${oldest.id}`}
              className="flex items-center justify-between gap-4 bg-card border border-border rounded-2xl p-5 hover:border-white/15 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                  Longest on the shelf
                </p>
                <p className="text-sm font-medium tracking-tight truncate">{oldest.title}</p>
                <p className="text-[11px] font-light text-muted mt-0.5">
                  {Math.round((Date.now() - +new Date(oldest.created_at)) / 86_400_000)} days ·{" "}
                  {STATUS_LABELS[oldest.status]}
                </p>
              </div>
              <iconify-icon icon="solar:arrow-right-linear" width="18" height="18" noobserver="" className="text-muted shrink-0" />
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{label}</p>
      <p
        className={`text-2xl font-light tracking-tighter tabular-nums ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] font-light text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
