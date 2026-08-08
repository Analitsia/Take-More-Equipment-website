"use client";

import { useFormStatus } from "react-dom";
import { createDraft } from "@/app/(app)/items/actions";

/**
 * "New item" — a form, not a link.
 *
 * It used to be <Link href="/items/new">, and that page created the draft
 * during its own render. Two things were wrong with it. The one that showed:
 * a render may not call revalidatePath(), so Next.js threw before the redirect
 * ever happened and the route was a server error every time. The one that
 * would have shown later: a database INSERT on a GET. Next prefetches links,
 * browsers speculatively load them, and a reload or a back-button press repeats
 * them — each an untitled draft nobody asked for, appearing in the stock list.
 *
 * Posting to a server action puts the write where a write belongs: after a
 * deliberate press, in the one phase Next.js allows revalidation and redirects.
 *
 * Styling is passed in because the button appears in five places that look
 * nothing alike — a rail, a bottom nav, a page header, two empty states.
 */
export default function NewItemButton({
  className,
  formClassName = "",
  children,
}: {
  className: string;
  formClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <form action={createDraft} className={formClassName}>
      <Submit className={className}>{children}</Submit>
    </form>
  );
}

/**
 * Separate because useFormStatus only reports on a form above it in the tree.
 *
 * The disabled state is not decoration. A double-tap on a phone — the normal
 * way to press something you are not sure registered — would otherwise create
 * two drafts, and the second one is invisible until someone scrolls the list.
 */
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
