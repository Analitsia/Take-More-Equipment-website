import { redirect } from "next/navigation";

/**
 * A tombstone.
 *
 * This route used to create a draft item during its own render and redirect
 * into the editor. Next.js refuses that — revalidatePath() during a render
 * throws — and a write on a GET was the wrong shape regardless, since anything
 * that can prefetch or reload a URL could mint drafts. Creation now happens in
 * the createDraft server action behind the button; see components/NewItemButton.
 *
 * The path survives only so the URL still sitting in a history entry or an
 * address bar lands on the stock list rather than a 404. It must never mutate.
 */
export default function NewItemPage(): never {
  redirect("/items");
}
