"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Panel } from "@takemore/ui";
import { StatusPill } from "@takemore/ui";
import {
  ORDER_STATUS_LABELS,
  allocateSoldTotal,
  canSeeCosts,
  rands,
  type AppRole,
  type OrderStatus,
} from "@takemore/core";
import ItemThumb from "@/components/ItemThumb";
import type { OrderDetail, OrderEconomics, OrderLineCost, OrderLineRow } from "@/lib/orders";
import CustomerPicker from "./CustomerPicker";
import ProductPicker from "./ProductPicker";
import DeliveryPanel from "./DeliveryPanel";
import PaymentPanel from "./PaymentPanel";
import { removeLine } from "../actions";

const STATUS_CHROME: Record<OrderStatus, string> = {
  draft: "border-accent/40 text-accent",
  paid: "border-status-ready/40 text-status-ready",
  void: "border-border text-muted",
};

/**
 * The till.
 *
 * One page, top to bottom in the order a sale actually happens: who, what,
 * where to, how much, and how they paid. Nothing is a wizard — a customer
 * changes their mind about a machine after the delivery address has been taken,
 * and a screen that made you go back would be a screen people worked around.
 *
 * A paid or cancelled order renders the same layout with every control gone.
 * The record and the workspace are the same page on purpose: "what did we do
 * for this person" and "what are we doing for this person" are the same
 * question a week apart.
 */
export default function OrderScreen({
  order,
  lines,
  economics,
  lineCosts,
  role,
}: {
  order: OrderDetail;
  lines: OrderLineRow[];
  economics: OrderEconomics | null;
  lineCosts: OrderLineCost[];
  role: AppRole;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const locked = order.status !== "draft";
  const showCosts = canSeeCosts(role) && economics !== null;

  const costByItem = new Map(lineCosts.map((c) => [c.item_id, c]));

  const listTotal = lines.reduce((sum, line) => sum + line.list_price_cents, 0);
  const retailTotal = lines.reduce((sum, line) => sum + (line.retail_price_cents ?? 0), 0);
  const costTotal = showCosts ? (economics?.cost_total_cents ?? 0) : null;

  /**
   * What each machine will be recorded as having sold for, previewed.
   *
   * The same split confirm_order_paid() will perform, over the same lines in
   * the same order — which is why getOrderLines sorts by position then id. If
   * this disagreed with the database the screen would show one machine a few
   * cents different from what was about to be written, and the salesperson
   * would be the one who found out.
   */
  const preview =
    !locked && order.sold_total_cents
      ? allocateSoldTotal(
          order.sold_total_cents,
          lines.map((l) => l.list_price_cents)
        )
      : null;

  const handled = (result: { ok: boolean; message?: string }) => {
    setError(result.ok ? null : (result.message ?? "That did not work."));
    setNotice(result.ok ? (result.message ?? null) : null);
    startTransition(() => router.refresh());
  };

  const drop = async (itemId: string) => {
    setRemoving(itemId);
    const result = await removeLine(order.id, itemId);
    setRemoving(null);
    handled(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-medium tracking-tight font-mono tracking-widest">
            {order.code}
          </h1>
          <p className="text-xs font-light text-muted mt-1">
            opened{" "}
            {new Date(order.created_at).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-light border ${STATUS_CHROME[order.status]}`}
        >
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </header>

      {error && (
        <div className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
          {error}
        </div>
      )}
      {notice && (
        <div className="text-xs text-accent bg-accent/10 border border-accent/30 rounded-xl px-3 py-2.5">
          {notice}
        </div>
      )}

      <CustomerPicker order={order} locked={locked} onDone={handled} />

      <Panel
        title="Machines"
        subtitle={
          locked
            ? undefined
            : "Type the code off the sticker, or search for it."
        }
      >
        <div className="space-y-3">
          {!locked && <ProductPicker orderId={order.id} onDone={handled} />}

          {lines.length === 0 ? (
            <p className="text-sm font-light text-muted py-6 text-center">
              Nothing on this order yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {lines.map((line, index) => {
                const cost = costByItem.get(line.item_id);
                const share = line.sold_price_cents ?? preview?.[index] ?? null;

                return (
                  <li
                    key={line.id}
                    className="bg-background border border-border rounded-xl p-3"
                  >
                    <div className="flex gap-3">
                      <ItemThumb
                        media={line.item?.media ?? []}
                        className="w-11 h-11 rounded-lg"
                        icon={14}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium tracking-tight truncate">
                              {line.item?.title ?? "Machine"}
                            </p>
                            <p className="text-[11px] font-light text-muted truncate">
                              <span className="font-mono tracking-widest">
                                {line.item?.sku}
                              </span>
                              {line.item?.brand ? ` · ${line.item.brand}` : ""}
                            </p>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {line.item && <StatusPill status={line.item.status} size="sm" />}
                            {!locked && (
                              <button
                                type="button"
                                onClick={() => drop(line.item_id)}
                                disabled={removing === line.item_id}
                                aria-label="Take this machine off the order"
                                className="w-7 h-7 rounded-lg border border-border text-muted
                                           hover:text-status-sold hover:border-status-sold/40
                                           transition-colors flex items-center justify-center
                                           disabled:opacity-40"
                              >
                                <iconify-icon
                                  icon="solar:trash-bin-minimalistic-linear"
                                  width="13"
                                  height="13"
                                  noobserver=""
                                />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* The numbers a salesperson is holding in their head
                            while they talk. Asking, what it cost us split the
                            two ways that matter, and what the same machine
                            would cost new — which is the argument, not a cost. */}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums">
                          <Figure label="Asking" value={rands(line.list_price_cents)} />
                          {line.retail_price_cents ? (
                            <Figure label="New" value={rands(line.retail_price_cents)} />
                          ) : null}
                          {cost && (
                            <>
                              <Figure label="Auction" value={rands(cost.cost_purchase_cents)} />
                              <Figure label="Workshop" value={rands(cost.cost_refurb_cents)} />
                              <Figure label="Cost" value={rands(cost.cost_total_cents)} strong />
                            </>
                          )}
                          {share !== null && (
                            <Figure
                              label={locked ? "Sold for" : "Will record"}
                              value={rands(share)}
                              accent
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {lines.length > 0 && (
            <div className="border-t border-white/5 pt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] tabular-nums justify-end">
              <Figure label="Asking" value={rands(listTotal)} strong />
              {retailTotal > 0 && <Figure label="New would cost" value={rands(retailTotal)} />}
              {costTotal !== null && <Figure label="Cost floor" value={rands(costTotal)} strong />}
            </div>
          )}
        </div>
      </Panel>

      <DeliveryPanel order={order} locked={locked} onDone={handled} />

      <PaymentPanel
        order={order}
        listTotalCents={listTotal}
        costTotalCents={costTotal}
        showCosts={showCosts}
        // Reopening rewrites revenue that has already been reported, which is a
        // different kind of act from making a sale. Postgres is what enforces
        // it; hiding the button is only about not offering a door that opens
        // onto a refusal.
        canReopen={role === "manager" || role === "owner"}
        onDone={handled}
      />

      {order.lead && (
        <p className="text-[11px] font-light text-muted text-center">
          <Link href={`/leads/${order.lead.id}`} className="hover:text-white transition-colors">
            See everything about this customer
          </Link>
        </p>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-muted font-light">{label}</span>
      <span
        className={`${strong ? "font-medium" : "font-light"} ${
          accent ? "text-accent" : "text-white/90"
        }`}
      >
        {value}
      </span>
    </span>
  );
}
