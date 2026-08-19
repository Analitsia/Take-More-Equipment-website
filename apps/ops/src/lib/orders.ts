import { supabase } from "./supabase";
import { reportError } from "@takemore/observability";
import type { ItemStatus, OrderStatus, PaymentMethod } from "@takemore/core";
import type { MediaRef } from "./media";

/**
 * Reads for the order screen.
 *
 * Same posture as lib/queries.ts: the staff client, RLS decides, and a failed
 * read is reported rather than quietly becoming an empty list that reads as a
 * fact. The cost half is separated from the sale half for the reason
 * items/[id]/page.tsx separates them — the caller checks the role and skips the
 * fetch, so an account that may not see costs gets no panel rather than a panel
 * of zeroes.
 */

const orEmpty = <T>(
  where: string,
  result: { data: T[] | null; error: { message: string } | null }
): T[] => {
  if (result.error) reportError(result.error, { where });
  return result.data ?? [];
};

export type OrderRow = {
  id: string;
  code: string;
  status: OrderStatus;
  sold_total_cents: number | null;
  delivery: boolean;
  delivery_fee_cents: number;
  charged_total_cents: number | null;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  created_at: string;
  voided_at: string | null;
  lead: { id: string; full_name: string | null; business_name: string | null; phone: string | null } | null;
  lines: { item_id: string }[];
};

const ORDER_LIST_SELECT = `
  id, code, status, sold_total_cents, delivery, delivery_fee_cents,
  charged_total_cents, payment_method, paid_at, created_at, voided_at,
  lead:leads(id, full_name, business_name, phone),
  lines:order_lines(item_id)
`;

/**
 * Every order, newest first, filtered in the browser.
 *
 * Same call as listLeads() and for the same reason: at a few hundred sales a
 * year the whole table is smaller than the JavaScript that would page it, and
 * instant filtering is the difference between a list somebody uses and a list
 * somebody avoids.
 */
export async function listOrders(): Promise<OrderRow[]> {
  const client = await supabase();
  return orEmpty(
    "orders/listOrders",
    await client
      .from("orders")
      .select(ORDER_LIST_SELECT)
      .order("created_at", { ascending: false })
  ) as unknown as OrderRow[];
}

export type OrderDetail = {
  id: string;
  code: string;
  status: OrderStatus;
  lead_id: string | null;
  sold_total_cents: number | null;
  delivery: boolean;
  delivery_address: string | null;
  delivery_km: number | null;
  delivery_km_source: string | null;
  delivery_fee_cents: number;
  charged_total_cents: number | null;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  paid_at: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  lead: {
    id: string;
    full_name: string | null;
    business_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export async function getOrder(id: string): Promise<OrderDetail | null> {
  const client = await supabase();
  const { data, error } = await client
    .from("orders")
    .select(
      `id, code, status, lead_id, sold_total_cents, delivery, delivery_address,
       delivery_km, delivery_km_source, delivery_fee_cents, charged_total_cents,
       payment_method, payment_reference, paid_at, notes, voided_at, void_reason,
       created_at,
       lead:leads(id, full_name, business_name, email, phone)`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as unknown as OrderDetail | null;
}

export type OrderLineRow = {
  id: string;
  item_id: string;
  position: number;
  list_price_cents: number;
  retail_price_cents: number | null;
  sold_price_cents: number | null;
  item: {
    id: string;
    sku: string;
    title: string;
    brand: string | null;
    status: ItemStatus;
    media: MediaRef[];
  } | null;
};

/**
 * Ordered by `position` and then `id` — the same order confirm_order_paid()
 * iterates in. It has to be: the last line absorbs the rounding remainder, so a
 * screen that previewed the split in a different order would show one machine a
 * few cents different from what the database is about to write.
 */
export async function getOrderLines(orderId: string): Promise<OrderLineRow[]> {
  const client = await supabase();
  return orEmpty(
    "orders/getOrderLines",
    await client
      .from("order_lines")
      .select(
        `id, item_id, position, list_price_cents, retail_price_cents, sold_price_cents,
         item:items(id, sku, title, brand, status,
                    media:item_media(id, kind, storage_path, external_url, position, alt_text))`
      )
      .eq("order_id", orderId)
      .order("position", { ascending: true })
      .order("id", { ascending: true })
  ) as unknown as OrderLineRow[];
}

export type OrderLineCost = {
  line_id: string;
  item_id: string;
  cost_purchase_cents: number;
  cost_refurb_cents: number;
  cost_other_cents: number;
  cost_total_cents: number;
};

export type OrderEconomics = {
  list_total_cents: number;
  retail_total_cents: number;
  cost_purchase_cents: number;
  cost_refurb_cents: number;
  cost_other_cents: number;
  cost_total_cents: number;
  margin_cents: number;
};

/**
 * The cost floor, read live from item_costs through the two guarded views.
 *
 * Nothing is snapshotted onto the order: item_costs rows persist for a sold
 * machine, so reading them live is both truthful and automatically equal to
 * what item_analytics says about the same unit. A stored copy could disagree
 * with its own ledger, which is the failure item_economics exists to avoid.
 *
 * Returns nulls rather than zeroes when the reader may not see costs, so the
 * caller can render nothing at all instead of a floor of R0.
 */
export async function getOrderEconomics(
  orderId: string
): Promise<{ order: OrderEconomics | null; lines: OrderLineCost[] }> {
  const client = await supabase();

  const [orderResult, lineResult] = await Promise.all([
    client
      .from("order_economics")
      .select(
        `list_total_cents, retail_total_cents, cost_purchase_cents,
         cost_refurb_cents, cost_other_cents, cost_total_cents, margin_cents`
      )
      .eq("order_id", orderId)
      .maybeSingle(),
    client
      .from("order_line_economics")
      .select(
        `line_id, item_id, cost_purchase_cents, cost_refurb_cents,
         cost_other_cents, cost_total_cents`
      )
      .eq("order_id", orderId),
  ]);

  if (orderResult.error) reportError(orderResult.error, { where: "orders/getOrderEconomics" });

  return {
    order: (orderResult.data as unknown as OrderEconomics | null) ?? null,
    lines: orEmpty("orders/getOrderLineCosts", lineResult) as unknown as OrderLineCost[],
  };
}

/** For the orders badge and the dashboard: sales still open on the counter. */
export async function countOpenOrders(): Promise<number> {
  const client = await supabase();
  const { count, error } = await client
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft");

  if (error) {
    reportError(error, { where: "orders/countOpenOrders" });
    return 0;
  }
  return count ?? 0;
}
