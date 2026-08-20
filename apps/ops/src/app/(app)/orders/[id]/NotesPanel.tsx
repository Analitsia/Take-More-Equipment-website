"use client";

import { useState } from "react";
import { Panel, Textarea } from "@takemore/ui";
import type { OrderDetail } from "@/lib/orders";
import { setOrderNotes } from "../actions";

/**
 * The half of a sale a table of machines cannot say.
 *
 * `orders.notes` and `setOrderNotes()` have both existed since the order screen
 * shipped, and nothing has ever put a box on the page for them — so the column
 * has only ever been null. It earns its screen now because the invoice prints
 * it: "Hire collection 4th August, return 17th", "collecting Saturday",
 * "includes the stand", "the door seal is being replaced under warranty".
 *
 * Take More's own spreadsheet invoice carried exactly this, as an unpriced line
 * underneath the machines, and it was the line that made the document describe
 * an actual arrangement rather than a list of things.
 *
 * Saved on blur, like the price in PaymentPanel and for the same reason: a
 * salesperson called away mid-sentence comes back to what they typed. There is
 * no Save button because there is nothing to decide — the note is either
 * written down or it is not.
 */
export default function NotesPanel({
  order,
  locked,
  onDone,
}: {
  order: OrderDetail;
  locked: boolean;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [notes, setNotes] = useState(order.notes ?? "");
  const [saving, setSaving] = useState(false);

  if (locked) {
    // A paid order keeps its note on the page rather than hiding it: it is part
    // of what was agreed, and it is on the document the customer is holding.
    if (!order.notes?.trim()) return null;
    return (
      <Panel title="Note on this order">
        <p className="text-sm font-light text-white/80 whitespace-pre-wrap">{order.notes}</p>
      </Panel>
    );
  }

  const save = async () => {
    const next = notes.trim();
    if (next === (order.notes ?? "").trim()) return;
    setSaving(true);
    const result = await setOrderNotes(order.id, next);
    setSaving(false);
    if (!result.ok) onDone(result);
  };

  return (
    <Panel
      title="Anything else"
      subtitle="Goes on the invoice, under the machines."
      actions={saving ? <span className="text-[11px] font-light text-muted">Saving…</span> : null}
    >
      <Textarea
        value={notes}
        rows={2}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={save}
        placeholder="Collecting Saturday · hire back on the 17th · includes the stand"
        className="text-sm"
      />
    </Panel>
  );
}
