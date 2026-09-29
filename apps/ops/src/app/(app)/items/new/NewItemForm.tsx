"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { SEGMENTS, SEGMENT_LABELS, type Segment } from "@takemore/core";
import { createDraft } from "../actions";

export default function NewItemForm() {
  const [state, action] = useFormState(createDraft, { error: null });
  const [selected, setSelected] = useState<Segment[]>([]);
  return (
    <div className="max-w-xl mx-auto py-6">
      <Link href="/items" className="text-sm text-muted hover:text-white">← Stock</Link>
      <h1 className="text-2xl tracking-tight font-medium mt-7 mb-2">New item</h1>
      <p className="text-muted text-sm font-light mb-7">Choose where this product belongs before adding its details and photos.</p>
      <form action={action} className="bg-card border border-border rounded-2xl p-5 sm:p-7">
        <fieldset>
          <legend className="text-base mb-1">Which collection is this item for? <span className="text-accent">*</span></legend>
          <p id="segment-hint" className="text-sm text-muted mb-5">Required. Select one or both.</p>
          <div className="space-y-3">
            {SEGMENTS.map((segment) => <label key={segment} className={`flex gap-3 items-center p-4 border rounded-xl cursor-pointer ${selected.includes(segment) ? "border-accent bg-accent/10" : "border-border"}`}>
              <input type="checkbox" name="segments" value={segment} checked={selected.includes(segment)} aria-describedby="segment-hint"
                onChange={(event) => setSelected((old) => event.target.checked ? [...old, segment] : old.filter((s) => s !== segment))} className="w-4 h-4 accent-accent" />
              <span>{SEGMENT_LABELS[segment]}</span>
            </label>)}
          </div>
        </fieldset>
        {state.error && <p role="alert" className="text-status-sold text-sm mt-4">{state.error}</p>}
        <CreateButton ready={selected.length > 0} />
      </form>
    </div>
  );
}

function CreateButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={!ready || pending} aria-busy={pending}
    className="mt-6 w-full bg-accent text-background rounded-xl px-5 py-3 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed">
    {pending ? "Creating…" : "Continue to product details"}
  </button>;
}
