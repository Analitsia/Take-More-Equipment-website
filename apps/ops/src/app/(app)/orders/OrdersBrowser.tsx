"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  formatPhone,
  normalisePhone,
  rands,
  type OrderStatus,
} from "@takemore/core";
import type { OrderRow } from "@/lib/orders";

/**
 * Every sale, filtered in the browser.
 *
 * Same call as LeadsBrowser and for the same reason: a few hundred sales a year
 * is less data than the JavaScript that would page it, and instant filtering is
 * the difference between a list somebody uses and a list somebody avoids.
 */

type Filter = "all" | "draft" | "paid" | "void";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "draft", label: "Open" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Cancelled" },
];

const STATUS_CHROME: Record<OrderStatus, string> = {
  draft: "border-accent/40 text-accent",
  paid: "border-status-ready/40 text-status-ready",
  void: "border-border text-muted",
};

const customerOf = (order: OrderRow): string => {
  const lead = order.lead;
  if (!lead) return "No customer yet";
  return (
    lead.full_name?.trim() ||
    lead.business_name?.trim() ||
    (lead.phone ? formatPhone(lead.phone) : "") ||
    "Someone"
  );
};

export default function OrdersBrowser({ orders }: { orders: OrderRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    // "082 123 4567" and "+27 82 123 4567" have to find the same sale, so the
    // typed term is normalised the way the stored column is.
    const asPhone = normalisePhone(query);

    return orders.filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      if (!term) return true;

      const haystack = [
        order.code,
        order.lead?.full_name,
        order.lead?.business_name,
        order.lead?.phone,
        asPhone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [orders, query, filter]);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-3 max-w-3xl">
        <div className="relative flex-1">
          <iconify-icon
            icon="solar:magnifer-linear"
            width="16"
            height="16"
            noobserver=""
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="An order number, a name, or the last digits of their number"
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm font-light
                       text-white/90 placeholder:text-muted/60 hover:border-white/20
                       focus:border-accent focus:outline-none transition-colors"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors ${
              filter === f.value
                ? "border-accent/70 bg-accent/10 text-accent"
                : "border-border text-white/70 hover:border-white/25"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm font-light text-muted py-10 text-center">
          {orders.length === 0 ? "No orders yet." : "Nothing matches that."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((order) => {
            const machines = order.lines.length;
            return (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex items-center gap-3 bg-card border border-border rounded-2xl p-3
                             hover:border-white/15 transition-colors"
                >
                  <span className="w-11 h-11 rounded-xl bg-background border border-border shrink-0
                                   flex items-center justify-center text-muted">
                    <iconify-icon icon="solar:cart-large-2-linear" width="18" height="18" noobserver="" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium tracking-tight truncate">
                      <span className="font-mono tracking-widest">{order.code}</span>
                      <span className="text-white/50"> · </span>
                      {customerOf(order)}
                    </p>
                    <p className="text-[11px] font-light text-muted truncate">
                      {[
                        `${machines} machine${machines === 1 ? "" : "s"}`,
                        order.delivery ? "delivered" : null,
                        order.payment_method
                          ? PAYMENT_METHOD_LABELS[order.payment_method]
                          : null,
                        new Date(order.paid_at ?? order.created_at).toLocaleDateString("en-ZA", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-light border ${STATUS_CHROME[order.status]}`}
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    {order.charged_total_cents !== null && order.status !== "draft" && (
                      <span className="text-xs font-light text-white/80 tabular-nums">
                        {rands(order.charged_total_cents)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
