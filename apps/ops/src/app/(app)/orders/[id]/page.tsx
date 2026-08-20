import { notFound } from "next/navigation";
import Link from "next/link";
import { canSeeCosts } from "@takemore/core";
import { requireStaff } from "@/lib/supabase";
import { getOrder, getOrderEconomics, getOrderInvoices, getOrderLines } from "@/lib/orders";
import { invoicingIsConfigured } from "@/lib/invoice";
import OrderScreen from "./OrderScreen";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [staff, order] = await Promise.all([requireStaff(), getOrder(id)]);
  if (!order) notFound();

  const showCosts = canSeeCosts(staff.role);

  // The cost fetch is skipped entirely rather than fetched and hidden, the way
  // items/[id]/page.tsx does it. Today can_see_costs() is every approved
  // account, so this is always true — but keeping the shape is what makes
  // re-restricting one line in Postgres rather than an audit of every screen.
  const [lines, economics, invoices] = await Promise.all([
    getOrderLines(id),
    showCosts ? getOrderEconomics(id) : Promise.resolve({ order: null, lines: [] }),
    getOrderInvoices(id),
  ]);

  return (
    <div className="max-w-5xl">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-xs font-light text-muted hover:text-white transition-colors mb-4"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="14" height="14" noobserver="" />
        Orders
      </Link>

      <OrderScreen
        order={order}
        lines={lines}
        economics={economics.order}
        lineCosts={economics.lines}
        invoices={invoices}
        // Read on the server because the business's own details are environment
        // variables — this repository is public, so they cannot be in source and
        // the browser has no way to see them. The panel only needs to know
        // whether a document could be issued, and why not when it could not.
        invoicing={invoicingIsConfigured()}
        role={staff.role}
      />
    </div>
  );
}
