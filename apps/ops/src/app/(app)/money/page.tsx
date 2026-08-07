import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff, supabase } from "@/lib/supabase";
import { canSeeCosts, rands } from "@takemore/core";

export const dynamic = "force-dynamic";

/**
 * Margin, per unit.
 *
 * Reads item_economics, which RLS restricts to managers and owners — so a staff
 * account that guesses this URL gets sent home rather than shown an empty
 * table. The redirect is a courtesy; the policy is the control.
 */
export default async function MoneyPage() {
  const staff = await requireStaff();
  if (!canSeeCosts(staff.role)) redirect("/");

  const client = await supabase();
  const { data } = await client
    .from("item_economics")
    .select("item_id, sku, title, status, list_price_cents, sale_price_cents, total_cost_cents, margin_cents, margin_percent, days_to_sale")
    .order("margin_cents", { ascending: false });

  const rows = data ?? [];
  const totalCost = rows.reduce((s, r: any) => s + Number(r.total_cost_cents ?? 0), 0);
  const totalMargin = rows.reduce((s, r: any) => s + Number(r.margin_cents ?? 0), 0);

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">Money</h1>
        <p className="text-sm font-light text-muted mt-1">
          Cost, price and margin per machine. Never visible to staff accounts.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm font-light text-muted bg-card border border-border rounded-2xl p-8 text-center">
          Nothing costed yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
                Tied up in stock
              </p>
              <p className="text-2xl font-light tracking-tighter tabular-nums">
                {rands(totalCost)}
              </p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
                Margin at asking
              </p>
              <p className="text-2xl font-light tracking-tighter tabular-nums text-accent">
                {rands(totalMargin)}
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
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
                  {rows.map((row: any) => (
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
        </>
      )}
    </div>
  );
}
