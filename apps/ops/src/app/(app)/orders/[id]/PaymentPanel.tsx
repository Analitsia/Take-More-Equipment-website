"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Panel, RandInput } from "@takemore/ui";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  discountCents,
  discountPercent,
  rands,
  type PaymentMethod,
} from "@takemore/core";
import { confirmPaid, discardOrder, reopenOrder, setProvisionalTotal, voidOrder } from "../actions";
import type { OrderDetail } from "@/lib/orders";

/**
 * The number, and where the money came from.
 *
 * This is the point of the whole screen. The salesperson types what was
 * actually agreed — which is usually not the asking price, because they have
 * been negotiating — and everything they need to judge that number is already
 * on the page above: what we are asking, what it cost us, what it would cost
 * new. What this panel adds is the arithmetic, live, as the figure is typed:
 * how much was given away, and what is left.
 *
 * Neither payment option moves money. The card machine and the bank do that.
 * This records which of them it was, so the day's takings can be reconciled.
 */
export default function PaymentPanel({
  order,
  listTotalCents,
  costTotalCents,
  showCosts,
  canReopen,
  onDone,
}: {
  order: OrderDetail;
  listTotalCents: number;
  costTotalCents: number | null;
  showCosts: boolean;
  canReopen: boolean;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [cents, setCents] = useState<number | null>(order.sold_total_cents);
  const [method, setMethod] = useState<PaymentMethod>(order.payment_method ?? "card_machine");
  const [reference, setReference] = useState(order.payment_reference ?? "");
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const router = useRouter();

  const paid = order.status === "paid";
  const cancelled = order.status === "void";
  /**
   * An order nobody finished.
   *
   * It has to be closable, and until now it was not: the only way out of the
   * till was through a payment. A customer who walks away left an order open for
   * ever, holding its machines `reserved` and off the website, and the orders
   * list counted it as still on the counter.
   *
   * What it does depends on whether money was ever recorded, and that is the
   * whole rule:
   *
   *   never paid       →  discarded. Nothing is kept, because nothing happened.
   *   paid, or paid
   *   and reopened     →  cancelled, with a reason, kept for ever.
   *
   * `sold_by` is what tells them apart: confirm_order_paid() writes it and
   * reopen_order() deliberately does not clear it, so a draft that carries one
   * is a sale being corrected rather than a sale that never was.
   */
  const open = !paid && !cancelled;
  const everPaid = Boolean(order.sold_by);
  /** True when closing this order means deleting it rather than voiding it. */
  const discards = open && !everPaid;

  const goods = paid ? (order.sold_total_cents ?? 0) : (cents ?? 0);
  const charged = goods + order.delivery_fee_cents;
  const off = discountCents(listTotalCents, cents);
  const offPercent = discountPercent(listTotalCents, cents);
  const margin = costTotalCents === null ? null : goods - costTotalCents;
  const belowCost = margin !== null && margin < 0;

  const confirm = async () => {
    if (!cents || cents <= 0) return;
    setSaving(true);
    const result = await confirmPaid(order.id, cents, method, reference);
    setSaving(false);
    onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  const cancel = async () => {
    setVoiding(true);
    const result = discards ? await discardOrder(order.id) : await voidOrder(order.id, reason);
    setVoiding(false);
    if (result.ok) {
      setConfirmingVoid(false);
      setReason("");
      // A discarded order has no page to go back to. Pushed rather than
      // refreshed, because refreshing would land on a 404 for a row this very
      // click removed.
      if (discards) {
        router.push("/orders");
        router.refresh();
        return;
      }
    }
    onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  const reopen = async () => {
    setSaving(true);
    const result = await reopenOrder(order.id);
    setSaving(false);
    onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  return (
    <Panel
      title={paid ? "Paid" : cancelled ? "Cancelled" : "What it sold for"}
      subtitle={
        cancelled
          ? (order.void_reason ?? undefined)
          : paid
            ? undefined
            : "The real number, after whatever you agreed."
      }
    >
      <div className="space-y-3">
        {!paid && !cancelled && (
          <Field label="Price agreed for the machines">
            <RandInput
              valueCents={cents}
              onChangeCents={setCents}
              // Saved on blur so a salesperson called away mid-conversation
              // comes back to the figure rather than an empty box. A draft is
              // allowed to carry a goods total; it is the payment fields that
              // it may not carry.
              onBlur={() => {
                if (cents !== order.sold_total_cents) void setProvisionalTotal(order.id, cents);
              }}
              placeholder="0"
            />
          </Field>
        )}

        {/* The arithmetic. Asking, discount, delivery, and what they hand over. */}
        <dl className="space-y-1.5 text-sm border-t border-white/5 pt-3">
          <Row label="Asking" value={rands(listTotalCents)} muted />
          {off !== null && off !== 0 && (
            <Row
              label={off > 0 ? `Discount (${offPercent}%)` : "Above asking"}
              value={`${off > 0 ? "−" : "+"}${rands(Math.abs(off))}`}
              muted
            />
          )}
          {order.delivery && (
            <Row label="Delivery" value={rands(order.delivery_fee_cents)} muted />
          )}
          <Row label="Customer pays" value={rands(charged)} strong />
        </dl>

        {showCosts && costTotalCents !== null && (
          <dl
            className={`space-y-1.5 text-sm border rounded-xl px-3 py-2.5 ${
              belowCost
                ? "border-status-sold/30 bg-status-sold/5"
                : "border-white/5 bg-background"
            }`}
          >
            <Row label="What the machines cost us" value={rands(costTotalCents)} muted />
            <Row
              label={belowCost ? "Loss" : "Margin"}
              value={rands(Math.abs(margin ?? 0))}
              strong
              tone={belowCost ? "bad" : "good"}
            />
          </dl>
        )}

        {!paid && !cancelled && (
          <>
            <Field label="How did they pay?">
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors ${
                      method === m
                        ? "border-accent/70 bg-accent/10 text-accent"
                        : "border-border text-white/70 hover:border-white/25"
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Reference"
              hint="optional"
            >
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={
                  method === "card_machine" ? "Slip number" : "EFT reference"
                }
              />
            </Field>

            <p className="text-[11px] font-light text-muted">
              Only tick this once the money is actually there — the slip printed, or
              the transfer showing in the account.
            </p>

            <Button
              variant="primary"
              loading={saving}
              disabled={!cents || cents <= 0 || !order.lead_id}
              onClick={confirm}
              className="w-full"
            >
              {order.lead_id ? "Record the payment" : "Add a customer first"}
            </Button>
          </>
        )}

        {(paid || open) && (
          <div className="space-y-3 border-t border-white/5 pt-3">
            <p className="text-[11px] font-light text-muted">
              {[
                paid && order.payment_method ? PAYMENT_METHOD_LABELS[order.payment_method] : null,
                order.payment_reference,
                order.paid_at
                  ? new Date(order.paid_at).toLocaleString("en-ZA", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <div className="flex flex-wrap gap-2">
              {paid && canReopen && (
                <Button variant="secondary" loading={saving} onClick={reopen}>
                  Correct the amount
                </Button>
              )}
              <Button variant="danger" onClick={() => setConfirmingVoid((v) => !v)}>
                {discards ? "Discard this order" : "Cancel this sale"}
              </Button>
            </div>

            {confirmingVoid && (
              <div className="space-y-2">
                {/* A discard asks for no reason.
                    Nothing was sold, so there is nothing to explain to anybody
                    later — and a required box in front of an undo is how a
                    salesperson learns to leave the mess instead. A cancellation
                    is the opposite: it unwinds money that was recorded, and the
                    reason is the whole value of the record it leaves behind. */}
                {!discards && (
                  <Field label="Why?">
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="The finance fell through"
                    />
                  </Field>
                )}
                <p className="text-[11px] font-light text-muted">
                  {discards
                    ? "Nothing was sold, so this order will not be kept at all. Any machine held for it goes back into stock and back onto the website."
                    : "The machines go back into stock and back onto the website, and the money comes off the reports."}
                </p>
                <Button
                  variant="danger"
                  loading={voiding}
                  disabled={!discards && !reason.trim()}
                  onClick={cancel}
                >
                  {discards ? "Discard" : "Cancel"} {order.code}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-xs font-light ${muted ? "text-muted" : "text-white/80"}`}>
        {label}
      </dt>
      <dd
        className={`tabular-nums ${strong ? "text-base font-medium" : "text-sm font-light"} ${
          tone === "bad" ? "text-status-sold" : tone === "good" ? "text-accent" : "text-white/90"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
