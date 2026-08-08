import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff, supabase } from "@/lib/supabase";
import { canSeeCosts, rands } from "@takemore/core";
import { reportError } from "@takemore/observability";
import { CategoryChart, MonthlyChart, type CategoryRow, type MonthRow } from "./MoneyCharts";

export const dynamic = "force-dynamic";

/**
 * Where the money is.
 *
 * Reads item_economics and the three KPI views, all of which RLS restricts to
 * managers and owners — so a staff account that guesses this URL gets sent home
 * rather than shown an empty table. The redirect is a courtesy; the policy is
 * the control.
 *
 * ── On failed queries ─────────────────────────────────────────────────────
 *
 * Every read here used to discard its error and fall back to an empty list, so
 * a broken query rendered as "R0 tied up, R0 margin" — a page confidently
 * stating that the business has no money in it. On a page headed Money that is
 * the worst failure available, and it is silent.
 *
 * Now: the errors are reported, the page still renders (a 500 here helps
 * nobody), and the reader is TOLD when a number is missing rather than being
 * shown a zero that is really an absence.
 */
export default async function MoneyPage() {
  const staff = await requireStaff();
  if (!canSeeCosts(staff.role)) redirect("/");

  const client = await supabase();

  const [economics, position, months, categories] = await Promise.all([
    client
      .from("item_economics")
      .select(
        "item_id, sku, title, status, list_price_cents, sale_price_cents, total_cost_cents, margin_cents, margin_percent, days_to_sale"
      )
      .order("margin_cents", { ascending: false }),
    client.from("money_position").select("*").maybeSingle(),
    client.from("money_by_month").select("*"),
    client.from("money_by_category").select("*"),
  ]);

  const failures = [
    ["item_economics", economics.error],
    ["money_position", position.error],
    ["money_by_month", months.error],
    ["money_by_category", categories.error],
  ].filter(([, error]) => error) as [string, { message: string }][];

  for (const [view, error] of failures) {
    reportError(error, { where: "ops/money", view });
  }

  const rows = economics.data ?? [];
  const summary = position.data ?? null;
  const monthRows = (months.data ?? []) as MonthRow[];
  const categoryRows = (categories.data ?? []) as CategoryRow[];

  const nothingYet = rows.length === 0 && failures.length === 0;

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">Money</h1>
        <p className="text-sm font-light text-muted mt-1">
          Cost, price and margin per machine. Never visible to staff accounts.
        </p>
      </header>

      {/* Said out loud, because the alternative is a page of zeros that looks
          like an answer. */}
      {failures.length > 0 && (
        <p className="mb-4 text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
          Some of these numbers could not be loaded ({failures.map(([v]) => v).join(", ")}),
          so what is shown below is incomplete. This has been reported. Refresh
          in a moment, and tell Carlo if it keeps happening.
        </p>
      )}

      {nothingYet ? (
        <p className="text-sm font-light text-muted bg-card border border-border rounded-2xl p-8 text-center">
          Nothing costed yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {summary && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Tile
                  label="Tied up in stock"
                  value={rands(Number(summary.tied_up_cents ?? 0))}
                  note={`${summary.units_in_stock ?? 0} machines on the floor`}
                />
                <Tile
                  label="Margin at asking"
                  value={rands(Number(summary.unrealised_margin_cents ?? 0))}
                  note="if everything sells at its current price"
                  accent
                />
                <Tile
                  label="Margin, last 30 days"
                  value={rands(Number(summary.margin_30d_cents ?? 0))}
                  note={`${summary.units_sold_30d ?? 0} sold`}
                  accent
                />
                <Tile
                  label="Average days to sale"
                  value={
                    summary.avg_days_to_sale === null
                      ? "—"
                      : `${Number(summary.avg_days_to_sale)}`
                  }
                  note={`across ${summary.units_sold_all_time ?? 0} sold`}
                />
              </div>

              {/* The number that grows quietly while every other number looks
                  fine. Surfaced only when there is something to say. */}
              {Number(summary.aged_units ?? 0) > 0 && (
                <div className="bg-card border border-status-sold/30 rounded-2xl p-4 flex items-start gap-3">
                  <span className="w-8 h-8 shrink-0 rounded-xl bg-status-sold/10 border border-status-sold/30 flex items-center justify-center text-status-sold">
                    <iconify-icon icon="solar:hourglass-line-linear" width="16" height="16"></iconify-icon>
                  </span>
                  <div>
                    <p className="text-sm font-medium tracking-tight">
                      {rands(Number(summary.aged_stock_cents ?? 0))} sitting in{" "}
                      {Number(summary.aged_units)} machine
                      {Number(summary.aged_units) === 1 ? "" : "s"} over 90 days old
                    </p>
                    <p className="text-xs font-light text-muted mt-0.5">
                      Capital that is not working. Worth a price review, a photo
                      refresh, or a push to the people who asked for one.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          <MonthlyChart data={monthRows} />
          <CategoryChart data={categoryRows} />

          {categoryRows.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-sm font-medium tracking-tight">Rotation by category</h2>
                <p className="text-xs font-light text-muted mt-0.5">
                  What sells, how fast, and what is still standing there.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-muted">
                      <th className="text-left font-medium px-4 py-3">Category</th>
                      <th className="text-right font-medium px-4 py-3">Sold</th>
                      <th className="text-right font-medium px-4 py-3">Sell-through</th>
                      <th className="text-right font-medium px-4 py-3">Days</th>
                      <th className="text-right font-medium px-4 py-3">Tied up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {categoryRows
                      .slice()
                      .sort((a, b) => b.tied_up_cents - a.tied_up_cents)
                      .map((row) => (
                        <tr key={row.category}>
                          <td className="px-4 py-3 font-light">{row.category}</td>
                          <td className="px-4 py-3 text-right font-light tabular-nums">
                            {row.units_sold} / {row.units_total}
                          </td>
                          <td className="px-4 py-3 text-right font-light tabular-nums">
                            {row.sell_through_percent === null
                              ? "—"
                              : `${row.sell_through_percent}%`}
                          </td>
                          <td className="px-4 py-3 text-right font-light tabular-nums">
                            {row.avg_days_to_sale === null ? "—" : row.avg_days_to_sale}
                          </td>
                          <td className="px-4 py-3 text-right font-light tabular-nums whitespace-nowrap">
                            {rands(Number(row.tied_up_cents))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Per unit. Also the table view the charts above are obliged to
              have — every number in them is legible here without colour. */}
          {rows.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-sm font-medium tracking-tight">Every machine</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-muted">
                      <th className="text-left font-medium px-4 py-3">Item</th>
                      <th className="text-right font-medium px-4 py-3">Cost</th>
                      <th className="text-right font-medium px-4 py-3">Price</th>
                      <th className="text-right font-medium px-4 py-3">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rows.map((row) => (
                      <tr key={row.item_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 max-w-0">
                          <Link href={`/items/${row.item_id}`} className="block">
                            <span className="block font-light truncate">{row.title}</span>
                            <span className="block text-[11px] text-muted">{row.sku}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-light tabular-nums whitespace-nowrap">
                          {rands(Number(row.total_cost_cents ?? 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-light tabular-nums whitespace-nowrap">
                          {row.sale_price_cents ?? row.list_price_cents
                            ? rands(Number(row.sale_price_cents ?? row.list_price_cents))
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span
                            className={`font-medium tabular-nums ${
                              Number(row.margin_cents) >= 0 ? "text-accent" : "text-status-sold"
                            }`}
                          >
                            {row.margin_cents === null ? "—" : rands(Number(row.margin_cents))}
                          </span>
                          {row.margin_percent !== null && (
                            <span className="text-[11px] font-light text-muted ml-1.5">
                              {Number(row.margin_percent)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note?: string;
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
      {note && <p className="text-[11px] font-light text-muted mt-1">{note}</p>}
    </div>
  );
}
