"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { createDraft } from "@/app/(app)/items/actions";
import { createOrderDraft } from "@/app/(app)/orders/actions";

/**
 * "New" — the one button on the phone that asks which one.
 *
 * There are two new things a person starts in this app: a sale, and a machine.
 * The bottom bar has room for one more destination, not two, and picking one to
 * promote would be picking which half of the job is real. So the slot asks.
 *
 * WHY IT IS NOT A LINK, EITHER OF THEM
 * ------------------------------------
 * Both options post to a server action that INSERTS and then redirects, for the
 * reason written at length on NewItemButton: a GET that creates a row is fired
 * by prefetch, by the back button and by a reload. On stock that produced
 * untitled drafts; on the till it would produce empty orders in a ledger of
 * sales, and an order number is something said out loud to a customer.
 *
 * The sheet is deliberately tall and the two targets are deliberately large.
 * This is pressed with a thumb, one-handed, by somebody who is also holding
 * something else — and the wrong choice here is not a misprint, it is a row in
 * a table that then has to be discarded.
 */
export default function NewButton({
  className,
  label = "New",
}: {
  className: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  // Escape closes it. Cheap, and the alternative on a desk is a sheet that can
  // only be dismissed by aiming at the backdrop.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={className}
      >
        <iconify-icon icon="solar:add-circle-linear" width="20" height="20" noobserver="" />
        {label}
      </button>

      {open && (
        <>
          {/* Above the bottom nav (z-30) and below the sheet. Tapping anywhere
              that is not one of the two choices closes it, which is what a
              person expects and what makes an accidental press free. */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="md:hidden fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-label="What are you starting?"
            className="md:hidden fixed inset-x-3 bottom-[76px] z-50 rounded-2xl border border-border
                       bg-card p-3 space-y-2 shadow-2xl"
          >
            <p className="text-[11px] font-light text-muted px-1 pb-1">
              What are you starting?
            </p>

            <form action={createOrderDraft}>
              <Choice
                icon="solar:cart-large-2-linear"
                title="New order"
                detail="A customer is buying. Take their details and the machines."
                accent
              />
            </form>

            <form action={createDraft}>
              <Choice
                icon="solar:box-linear"
                title="New item"
                detail="A machine has come in. Photograph it and write it up."
              />
            </form>
          </div>
        </>
      )}
    </>
  );
}

/**
 * One of the two.
 *
 * Its own component because useFormStatus only reports on a form ABOVE it in
 * the tree — and the pending state is not decoration here. A double tap on a
 * phone, which is how somebody presses a thing they are not sure registered,
 * would otherwise open two orders.
 */
function Choice({
  icon,
  title,
  detail,
  accent,
}: {
  icon: string;
  title: string;
  detail: string;
  accent?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left
                  transition-colors disabled:opacity-60 disabled:cursor-wait ${
                    accent
                      ? "border-accent/60 bg-accent/10"
                      : "border-border bg-background hover:border-white/25"
                  }`}
    >
      <span
        className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${
          accent ? "bg-accent text-background" : "border border-border text-white/80"
        }`}
      >
        <iconify-icon icon={icon} width="18" height="18" noobserver="" />
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${accent ? "text-accent" : "text-white/90"}`}>
          {title}
        </span>
        <span className="block text-[11px] font-light text-muted">{detail}</span>
      </span>
    </button>
  );
}
