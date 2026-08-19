"use client";

import { useFormStatus } from "react-dom";
import { createOrderDraft } from "@/app/(app)/orders/actions";

/**
 * "New order" — a form, not a link, for every reason written on NewItemButton.
 *
 * A GET that inserts a row is fired by prefetch, by the back button and by a
 * reload. On the stock list that produced untitled drafts; here it would
 * produce empty orders in a ledger of sales, which is worse — an order number
 * is said out loud to a customer, and a sequence with gaps in it invites
 * somebody to ask what happened to ORD-0006.
 */
export default function NewOrderButton({
  className,
  formClassName = "",
  children,
}: {
  className: string;
  formClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <form action={createOrderDraft} className={formClassName}>
      <Submit className={className}>{children}</Submit>
    </form>
  );
}

function Submit({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:opacity-60 disabled:cursor-wait`}
    >
      {children}
    </button>
  );
}
