import { requireStaff } from "@/lib/supabase";
import { listOrders } from "@/lib/orders";
import { rands } from "@takemore/core";
import NewOrderButton from "@/components/NewOrderButton";
import OrdersBrowser from "./OrdersBrowser";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [, orders] = await Promise.all([requireStaff(), listOrders()]);

  const open = orders.filter((o) => o.status === "draft");
  const paid = orders.filter((o) => o.status === "paid");
  // What has actually been taken, ever. Charged rather than goods, because this
  // is the till's number and delivery is money that came in too.
  const taken = paid.reduce((sum, o) => sum + (o.charged_total_cents ?? 0), 0);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-5 h-1 rounded-full bg-accent" />
        <span className="text-accent uppercase text-[11px] tracking-wider">Orders</span>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-medium tracking-tight">
            {orders.length === 0
              ? "No sales yet"
              : `${paid.length} sold · ${rands(taken)}`}
          </h1>
          <p className="text-sm font-light text-muted mt-1">
            {open.length > 0
              ? `${open.length} still open on the counter.`
              : "Nothing open on the counter."}
          </p>
        </div>

        <NewOrderButton className="flex items-center gap-2 bg-accent text-background rounded-xl px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
          <iconify-icon icon="solar:cart-large-2-linear" width="16" height="16" noobserver="" />
          New order
        </NewOrderButton>
      </header>

      <OrdersBrowser orders={orders} />
    </div>
  );
}
