"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase, requireStaff } from "@/lib/supabase";
import { createAdminClient } from "@takemore/db/admin";
import { revalidateStorefront } from "@/lib/storefront";
import { normalisePhone, type ItemStatus, type PaymentMethod } from "@takemore/core";
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
 * Take a machine back off the order and put it back where it came from.
 *
 * "Where it came from" is the load-bearing half. The line wrote down what the
 * machine was doing when it was picked up — see
 * 20260819110100_a_machine_remembers_where_it_was.sql — so a fryer that was in
 * pieces on the workshop bench goes back to the bench rather than onto the
 * board marked For sale. It is read BEFORE the line is deleted, because after
 * that there is nothing left to read.
 *
 * setStage() does the putting back rather than a direct update: it already
 * knows the publish gate fires before the status trigger and so `published_at`
 * has to be a second write, and it already re-runs the lead matcher, which is
 * exactly right for a machine that has just become available again.
 */
export async function removeLine(orderId: string, itemId: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { data: line } = await client
    .from("order_lines")
    .select("held_from_status")
    .eq("order_id", orderId)
    .eq("item_id", itemId)
    .maybeSingle();

  const { error } = await client
    .from("order_lines")
    .delete()
    .eq("order_id", orderId)
    .eq("item_id", itemId);

  if (error) return { ok: false, error: humanise(error.message) };

  // 'listed' for a line written before that column existed, which is what those
  // lines used to get unconditionally.
  const back = await setStage(itemId, (line?.held_from_status as ItemStatus) ?? "listed");
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
 * An order that never became a sale does not stay on the books.
 *
 * ── The rule, in one line ─────────────────────────────────────────────────
 *
 *   Never paid  →  it is discarded, and nothing is kept.
 *   Paid, then wrong  →  voidOrder(), and the record stays for ever.
 *
 * That split is the whole design. A salesperson opens the till by pressing a
 * button, so a mis-tap, a customer who walks away and a quote that came to
 * nothing all create an order row. Keeping those as "Cancelled" would mean a
 * list of sales that is mostly not sales, and a machine held `reserved` and off
 * the website with no obvious way back. A cancelled SALE is different: money
 * was recorded and then unrecorded, and that is a fact somebody may have to
 * explain to a customer or an accountant a year later.
 *
 * ── Why the admin key ─────────────────────────────────────────────────────
 *
 * "owner deletes orders" is the only DELETE policy on the table, and the person
 * who needs to undo a mis-tap is the salesperson who made it, not the owner.
 * The guards below are therefore what stands in for that policy, and they are
 * deliberately stricter than it: staff only, drafts only, and never an order
 * that has been paid at any point in its life.
 *
 * The same reach for the admin key, for the same kind of reason, is in
 * team/actions.ts and login/actions.ts. If this rule is ever wanted in Postgres
 * instead — where the rest of this system keeps its rules — it is a
 * `discard_order()` RPC and this function becomes a call to it.
 *
 * ── sold_by is the memory ─────────────────────────────────────────────────
 *
 * reopen_order() puts a PAID order back into 'draft' to have its total
 * corrected, so "status is draft" is not the same question as "was never paid".
 * `sold_by` is written by confirm_order_paid() and by nothing else, and reopen
 * deliberately leaves it alone — so it is the one column that still remembers.
 */
export async function discardOrder(orderId: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  // Read through the STAFF client, so somebody who cannot see this order cannot
  // delete it either. The admin key below is used to carry out a decision that
  // has already been authorised, never to make one.
  const { data: order, error: readError } = await client
    .from("orders")
    .select("id, code, status, sold_by")
    .eq("id", orderId)
    .maybeSingle();

  if (readError) return { ok: false, error: humanise(readError.message) };
  if (!order) return { ok: false, error: "That order is not there any more." };

  if (order.status !== "draft")
    return {
      ok: false,
      error:
        order.status === "paid"
          ? "This one is paid. Cancel it instead, so the record of the money stays."
          : "This one is already cancelled.",
    };

  if (order.sold_by)
    return {
      ok: false,
      error:
        "This order was paid before and reopened. Cancel it instead, so its history stays.",
    };

  const { data: lines } = await client
    .from("order_lines")
    .select("item_id, held_from_status")
    .eq("order_id", orderId);

  // Each machine and the stage it was in before this order picked it up. Read
  // now, because the delete below takes the lines with it.
  const items = (lines ?? []).map((l) => ({
    id: l.item_id,
    back: (l.held_from_status as ItemStatus) ?? ("listed" as ItemStatus),
  }));

  const admin = createAdminClient();

  // `.eq("status", "draft")` a second time, on the delete itself. The read above
  // was a moment ago, and in that moment somebody else could have taken payment
  // on this very order from another phone.
  const { error: deleteError } = await admin
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("status", "draft");

  if (deleteError) return { ok: false, error: humanise(deleteError.message) };

  // The one line the log had about it goes too.
  //
  // activity_log is append-only everywhere else in this system and that is
  // right, because it records what happened to machines and to money. This
  // order recorded neither: no payment, no customer event, nothing. Leaving
  // "ORD-0021 opened" behind would put an order number on the team's timeline
  // that resolves to nothing, which reads as a bug rather than as history.
  // The machines' OWN status changes are untouched and still say where they
  // went and came back.
  await admin.from("activity_log").delete().eq("entity", "order").eq("entity_id", orderId);

  // Back on the shelf and back on the website. Through setStage() rather than a
  // direct update, because it already knows that publishing is a second write
  // and it re-runs the lead matcher for a machine that has just become
  // available again.
  const stuck: string[] = [];
  for (const item of items) {
    const restored = await setStage(item.id, item.back);
    if (!restored.ok) stuck.push(item.id);
  }

  const ids = items.map((i) => i.id);
  for (const id of ids) await revalidateStorefront(id);
  await revalidateSale(orderId, ids);

  return {
    ok: true,
    notice: items.length
      ? `${order.code} is gone. ${items.length} machine${items.length === 1 ? " is" : "s are"} back where they were.` +
        (stuck.length ? " Not all of them are back on the website yet." : "")
      : `${order.code} is gone.`,
  };
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

  const result = data as
    | { code?: string; items?: string[]; restore?: { item_id: string; status: ItemStatus }[] }
    | null;
  const items = result?.items ?? [];

  // The RPC put each machine back in the stage it was in before the order —
  // the workshop, if that is where it came from — but deliberately did not
  // re-publish: published_at set inside a definer function sails past the
  // publish gate, which fires before the status trigger. setStage() knows the
  // two-step dance, so the machines go back up through it, and it says which
  // ones could not rather than leaving somebody to notice that a machine never
  // reappeared on the site.
  //
  // Asking for the stage it is already in is not a wasted write: the status
  // trigger returns immediately when nothing moved, and the publish half is the
  // part that had to happen out here.
  const restore =
    result?.restore ?? items.map((id) => ({ item_id: id, status: "listed" as ItemStatus }));

  const stuck: string[] = [];
  for (const entry of restore) {
    const back = await setStage(entry.item_id, entry.status);
    if (!back.ok) stuck.push(entry.item_id);
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
