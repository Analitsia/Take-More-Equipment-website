import { createDraft } from "../actions";

/**
 * "New item" is not a blank form — it is a row.
 *
 * Creating the draft immediately and redirecting into the editor is what makes
 * autosave possible from the very first keystroke, and it means the first thing
 * a worker does is photograph the machine rather than fill in a form header.
 * The cost is the occasional abandoned draft, which is cheap and visible.
 */
export default async function NewItemPage() {
  await createDraft(); // redirects to /items/<id>
}
