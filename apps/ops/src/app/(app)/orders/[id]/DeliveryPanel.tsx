"use client";

import { useState } from "react";
import { Button, Field, Input, Panel } from "@takemore/ui";
import { DELIVERY_RULE_LABEL, deliveryFeeCents, rands } from "@takemore/core";
import { setDelivery } from "../actions";
import AddressAutocomplete from "./AddressAutocomplete";
import type { OrderDetail } from "@/lib/orders";

/**
 * Getting it to them, and what that costs.
 *
 * The fee is never typed. It is computed from the distance — here as the number
 * is edited, so the salesperson can quote before saving, and again in Postgres
 * by a trigger on every write, which is the one that counts. Two copies of one
 * rule, pinned to each other by the parity suite, for the same reason the phone
 * normaliser has two.
 *
 * Looking the distance up is a convenience and never a requirement. With no
 * Google key configured, an unresolvable address, or the API simply down, the
 * kilometres are typed and everything downstream is identical — which is why
 * `delivery_km_source` is recorded: it is the only way to tell afterwards which
 * of the two produced a fee that later looks wrong.
 *
 * The same is true one field up: the address box suggests as you type, and when
 * it cannot it is an ordinary text box. Picking a suggestion is worth a little
 * more than the typing it saves — it hands /api/distance a string Google has
 * already resolved, so the measurement stops failing on shorthand and typos.
 */
/**
 * "12,5" is what a South African keyboard produces for twelve and a half, and
 * Number("12,5") is NaN — which previewed R0 and saved null. One reading of the
 * box, shared by the preview and the save, so they cannot disagree.
 */
const readKm = (raw: string): number | null => {
  const text = raw.trim().replace(/,/g, ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
};

export default function DeliveryPanel({
  order,
  locked,
  busy = false,
  onDone,
}: {
  order: OrderDetail;
  locked: boolean;
  /** The screen is between an action and its refresh; nothing may be tapped. */
  busy?: boolean;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [on, setOn] = useState(order.delivery);
  const [address, setAddress] = useState(order.delivery_address ?? "");
  const [km, setKm] = useState<string>(order.delivery_km?.toString() ?? "");
  const [source, setSource] = useState<"google" | "manual">(
    (order.delivery_km_source as "google" | "manual") ?? "manual"
  );
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  const kmNumber = readKm(km);
  const kmProblem =
    kmNumber === null
      ? null
      : Number.isNaN(kmNumber)
        ? "The distance has to be a number of kilometres, like 12.5."
        : kmNumber < 0
          ? "The distance cannot be negative."
          : null;
  const previewFee = kmNumber !== null && !kmProblem ? deliveryFeeCents(kmNumber) : 0;

  const lookUp = async () => {
    if (address.trim().length < 4) return;
    setLooking(true);
    setLookupNote(null);
    try {
      const response = await fetch("/api/distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = (await response.json()) as { km?: number | null; reason?: string };

      if (typeof data.km === "number") {
        setKm(String(data.km));
        setSource("google");
        setLookupNote(null);
      } else {
        setLookupNote(
          data.reason === "not-configured"
            ? "Distance lookup is not set up. Type the kilometres."
            : data.reason === "unresolvable"
              ? "Couldn't find that address. Type the kilometres."
              : "The distance lookup is down. Type the kilometres."
        );
      }
    } catch {
      setLookupNote("The distance lookup is down. Type the kilometres.");
    }
    setLooking(false);
  };

  const save = async () => {
    if (on && kmProblem) {
      onDone({ ok: false, message: kmProblem });
      return;
    }
    setSaving(true);
    const result = await setDelivery(order.id, {
      delivery: on,
      address,
      km: on ? kmNumber : null,
      source,
    });
    setSaving(false);
    onDone(result.ok ? { ok: true } : { ok: false, message: result.error });
  };

  if (locked) {
    return (
      <Panel title="Delivery">
        {order.delivery ? (
          <div className="space-y-1">
            <p className="text-sm font-light text-white/90">{order.delivery_address}</p>
            <p className="text-[11px] font-light text-muted">
              {order.delivery_km} km · {rands(order.delivery_fee_cents)}
              {order.delivery_km_source === "manual" ? " · distance entered by hand" : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm font-light text-muted">Collected from the warehouse.</p>
        )}
      </Panel>
    );
  }

  return (
    <Panel title="Delivery" subtitle={DELIVERY_RULE_LABEL}>
      <div className="space-y-3">
        <div className="flex gap-2">
          {[
            { value: false, label: "They collect" },
            { value: true, label: "We deliver" },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setOn(option.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors ${
                on === option.value
                  ? "border-accent/70 bg-accent/10 text-accent"
                  : "border-border text-white/70 hover:border-white/25"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {on && (
          <>
            <AddressAutocomplete value={address} onChange={setAddress} />

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Field
                  label="Distance"
                  hint={source === "google" ? "measured" : "entered by hand"}
                  error={kmProblem}
                >
                  <Input
                    value={km}
                    onChange={(e) => {
                      setKm(e.target.value);
                      // Any keystroke means a person decided. The driver knows
                      // the road better than the API does, and the record
                      // should say which of them answered.
                      setSource("manual");
                    }}
                    inputMode="decimal"
                    placeholder="km"
                  />
                </Field>
              </div>

              <Button
                variant="secondary"
                loading={looking}
                disabled={busy || address.trim().length < 4}
                onClick={lookUp}
                className="mb-0"
              >
                Get distance
              </Button>
            </div>

            {lookupNote && (
              <p className="text-[11px] font-light text-muted">{lookupNote}</p>
            )}

            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <span className="text-xs font-light text-muted">Delivery fee</span>
              <span className="text-sm font-medium tabular-nums">{rands(previewFee)}</span>
            </div>
          </>
        )}

        <Button variant="primary" loading={saving} disabled={busy || (on && Boolean(kmProblem))} onClick={save}>
          Save delivery
        </Button>
      </div>
    </Panel>
  );
}
