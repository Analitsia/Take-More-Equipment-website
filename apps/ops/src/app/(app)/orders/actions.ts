"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase, requireStaff } from "@/lib/supabase";
import { revalidateStorefront } from "@/lib/storefront";
import { normalisePhone, type PaymentMethod } from "@takemore/core";
import { setStage } from "../items/actions";

/**
 * Everything an order can be told to do.
 *
 * Thin, like items/actions.ts and for the same reason: the rules — what a paid
 * order may become, how a discount is split across machines, what a delivery
 * costs — are all in Postgres, and a second copy here would be a copy that can
 * disagree. The interesting work in this file is the half that CANNOT be in a
 * transaction: cache revalidation, telling the storefront, and re-publishing a
 * machine that came back into stock.
 */

export type ActionResult =
  | { ok: true; notice?: string }
  | { ok: false; error: string };

/**
 * The RPCs raise sentences rather than codes, so most of these pass straight
 * through. What is caught here is the handful of constraint names a person
 * would otherwise meet raw.
 */
const humanise = (message: string): string => {
  // PostgREST's wording for "that table is not there": what a deploy landing
  // ahead of its migration looks like from the app. Said plainly, because the
  // raw text sends people hunting for a bug in code that is working.
  if (/schema cache|relation .* does not exist/i.test(message))
    return "Orders need a database change that has not been applied yet. Run the migrations.";
  if (message.includes("orders_paid_is_complete"))
    return "This order still needs a customer and a price before it can be paid.";
  if (message.includes("orders_delivery_is_complete"))
    return "Delivery needs an address and a distance.";
  if (message.includes("orders_draft_carries_no_payment"))
    return "An open order cannot already have a payment on it.";
  if (message.includes("order_lines_order_id_item_id_key"))
    return "That machine is already on this order.";
  if (message.includes("leads_email_key"))
    return "Somebody else in the list already has that email address.";
  if (message.includes("leads_phone_key"))
    return "Somebody else in the list already has that phone number.";
  if (message.includes("leads_reachable"))
    return "A customer needs an email address or a phone number.";
  if (message.includes("permission denied") || message.includes("row-level security"))
    return "You don't have permission to do that.";
  return message;
};

/** Every surface a completed or changed sale is visible on. */
async function revalidateSale(orderId: string, itemIds: string[] = []) {
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/items");
  revalidatePath("/board");
  revalidatePath("/");
  revalidatePath("/leads");
  for (const id of itemIds) revalidatePath(`/items/${id}`);
}

// ---------------------------------------------------------------------------
// Opening one
// ---------------------------------------------------------------------------

/**
 * A `<form action>` rather than a link, exactly as createDraft() is — see the
 * header of NewItemButton.tsx. A GET that inserts a row gets fired by prefetch,
 * by the back button and by a reload, and every one of those is a phantom order
 * in the list.
 */
export async function createOrderDraft(): Promise<never> {
  await requireStaff();
  const client = await supabase();

  const { data, error } = await client
    .from("orders")
    .insert({ status: "draft" })
    .select("id")
    .single();

  if (error) throw new Error(humanise(error.message));

  revalidatePath("/orders");
  redirect(`/orders/${data.id}`);
}

// ---------------------------------------------------------------------------
// The customer
// ---------------------------------------------------------------------------

export async function setOrderCustomer(
  orderId: string,
  leadId: string | null
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client.from("orders").update({ lead_id: leadId }).eq("id", orderId);
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/**
 * Capture somebody who has never been in the system, without leaving the till.
 *
 * Mirrors createLead() in leads/actions.ts including its duplicate recovery —
 * a phone number that already exists means this is a returning customer, and
 * attaching the order to the person we already have is the right answer rather
 * than an error message. The difference is the return: createLead redirects,
 * and here the salesperson must stay on the order.
 */
export async function createOrderCustomer(
  orderId: string,
  input: { full_name: string; phone: string; email: string; business_name: string }
): Promise<ActionResult> {
  const staff = await requireStaff();
  const client = await supabase();

  const clean = (value: string) => value.trim() || null;
  const email = clean(input.email);
  const phone = clean(input.phone);

  const { data, error } = await client
    .from("leads")
    .insert({
      full_name: clean(input.full_name),
      email,
      phone,
      business_name: clean(input.business_name),
      source: "walk_in",
      created_by: staff.userId,
    })
    .select("id")
    .single();

  let leadId = data?.id ?? null;

  if (error) {
    const duplicate =
      error.message.includes("leads_email_key") || error.message.includes("leads_phone_key");
    if (!duplicate) return { ok: false, error: humanise(error.message) };

    const or = [
      email ? `email.ilike.${email}` : null,
      phone ? `phone_e164.eq.${normalisePhone(phone)}` : null,
    ]
      .filter(Boolean)
      .join(",");

    const { data: existing } = await client
      .from("leads")
      .select("id")
      .is("deleted_at", null)
      .or(or)
      .limit(1)
      .maybeSingle();

    if (!existing) return { ok: false, error: humanise(error.message) };
    leadId = existing.id;
  }

  if (!leadId) return { ok: false, error: "That customer could not be saved." };

  const attached = await client.from("orders").update({ lead_id: leadId }).eq("id", orderId);
  if (attached.error) return { ok: false, error: humanise(attached.error.message) };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/leads");
  return {
    ok: true,
    notice: error ? "We already had this person — the order is on their record." : undefined,
  };
}

// ---------------------------------------------------------------------------
// The machines
// ---------------------------------------------------------------------------

/**
 * Add a machine by the code somebody typed, or by the row they clicked.
 *
 * Resolution happens in SQL so the refusal comes from the thing that knows: "no
 * machine has the code A042" and "A042 is already on ORD-0009" are both answers
 * the browser would have to guess at.
 */
export async function addLine(
  orderId: string,
  ref: { code?: string; itemId?: string }
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { data, error } = await client.rpc("add_order_line", {
    p_order_id: orderId,
    p_code: ref.code,
    p_item_id: ref.itemId,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  const added = data as { item_id?: string; sku?: string; title?: string } | null;

  // The machine is now reserved and off the website, so the storefront needs to
  // hear about it. Fire-and-forget by design — a sale must not wait on another
  // deployment's HTTP round trip.
  if (added?.item_id) await revalidateStorefront(added.item_id);
  await revalidateSale(orderId, added?.item_id ? [added.item_id] : []);

  return { ok: true, notice: added?.sku ? `${added.sku} added and held.` : undefined };
}

/**
 * Take a machine back off the order and put it back on the shelf.
 *
 * The line is deleted directly — the "staff manage draft lines" policy allows
 * it while the order is open — and then setStage() does the rest. Reusing that
 * action rather than reimplementing it matters: it already knows the publish
 * gate fires before the status trigger and so `published_at` has to be a second
 * write, and it already re-runs the lead matcher, which is exactly right for a
 * machine that has just become available again.
 */
export async function removeLine(orderId: string, itemId: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("order_lines")
    .delete()
    .eq("order_id", orderId)
    .eq("item_id", itemId);

  if (error) return { ok: false, error: humanise(error.message) };

  const back = await setStage(itemId, "listed");
  await revalidateSale(orderId, [itemId]);

  // setStage reports its own trouble — "it is not on the website yet, it needs
  // a photo" — and that is worth passing on rather than swallowing. It is not a
  // failure of this action: the machine did come off the order.
  return { ok: true, notice: back.ok ? back.notice : back.error };
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export async function setDelivery(
  orderId: string,
  input: {
    delivery: boolean;
    address?: string | null;
    km?: number | null;
    source?: "google" | "manual" | null;
  }
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  // The fee is not sent. app.orders_before_write() recomputes it from the
  // distance on every write, which is what stops a corrected kilometre leaving
  // yesterday's price behind it.
  const { error } = await client
    .from("orders")
    .update({
      delivery: input.delivery,
      delivery_address: input.delivery ? (input.address?.trim() || null) : null,
      delivery_km: input.delivery ? (input.km ?? null) : null,
      delivery_km_source: input.delivery ? (input.source ?? "manual") : null,
    })
    .eq("id", orderId);

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function setOrderNotes(orderId: string, notes: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("orders")
    .update({ notes: notes.trim() || null })
    .eq("id", orderId);

  if (error) return { ok: false, error: humanise(error.message) };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/**
 * Remember the figure being negotiated, before it is committed.
 *
 * A draft is allowed to carry a goods total — see the
 * orders_draft_carries_no_payment constraint, which deliberately leaves this
 * column out — so a salesperson interrupted mid-conversation does not come back
 * to an empty box.
 */
export async function setProvisionalTotal(
  orderId: string,
  cents: number | null
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("orders")
    .update({ sold_total_cents: cents })
    .eq("id", orderId);

  if (error) return { ok: false, error: humanise(error.message) };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export async function confirmPaid(
  orderId: string,
  soldTotalCents: number,
  method: PaymentMethod,
  reference: string
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { data, error } = await client.rpc("confirm_order_paid", {
    p_order_id: orderId,
    p_sold_total_cents: soldTotalCents,
    p_method: method,
    p_reference: reference.trim() || undefined,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  const result = data as { code?: string; items?: string[] } | null;
  const items = result?.items ?? [];

  // Everything below here is best-effort and must never turn a completed sale
  // into an error the salesperson sees. The money is recorded; a stale cache is
  // a cosmetic problem that the storefront's own revalidation heals anyway.
  for (const id of items) await revalidateStorefront(id);
  await revalidateSale(orderId, items);

  return { ok: true, notice: `${result?.code ?? "The order"} is paid.` };
}

/**
 * Un-sell everything and mark the order cancelled.
 *
 * Left at `staff`, which is the position 20260808100000_reversible_sale.sql
 * already took for un-selling an item: a wrong number nobody can correct is
 * worse than a correction anybody can audit, and every void is stamped with an
 * actor in the activity log.
 */
export async function voidOrder(orderId: string, reason: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { data, error } = await client.rpc("void_order", {
    p_order_id: orderId,
    p_reason: reason,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  const result = data as { code?: string; items?: string[] } | null;
  const items = result?.items ?? [];

  // The RPC deliberately did not re-publish: published_at set inside a definer
  // function sails past the publish gate, which fires before the status
  // trigger. setStage() knows the two-step dance, so the machines go back up
  // through it — and it says which ones could not, rather than leaving somebody
  // to notice that a machine never reappeared on the site.
  const stuck: string[] = [];
  for (const id of items) {
    const back = await setStage(id, "listed");
    if (!back.ok) stuck.push(id);
  }

  for (const id of items) await revalidateStorefront(id);
  await revalidateSale(orderId, items);

  return {
    ok: true,
    notice: stuck.length
      ? `${result?.code ?? "The order"} is cancelled. ${stuck.length} machine${stuck.length === 1 ? " is" : "s are"} back in stock but not back on the website yet.`
      : `${result?.code ?? "The order"} is cancelled and its machines are back in stock.`,
  };
}

/** Manager and above: reopening rewrites revenue that has already been reported. */
export async function reopenOrder(orderId: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { data, error } = await client.rpc("reopen_order", { p_order_id: orderId });
  if (error) return { ok: false, error: humanise(error.message) };

  const result = data as { code?: string; items?: string[] } | null;
  const items = result?.items ?? [];

  for (const id of items) await revalidateStorefront(id);
  await revalidateSale(orderId, items);

  return { ok: true, notice: `${result?.code ?? "The order"} is open again.` };
}
