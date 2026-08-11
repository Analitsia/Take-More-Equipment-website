"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Panel } from "@takemore/ui";
import { softDeleteItem } from "../actions";

/**
 * Deleting a machine.
 *
 * Two taps, and the second one is deliberately not in the same place as the
 * first — the trash icon only asks the question, and the button that answers it
 * appears where the icon was not. Everything else on this page autosaves on
 * blur, so this is the one control where an accidental touch cannot be undone by
 * typing the value back in.
 *
 * The question is drawn here rather than handed to confirm(): a browser dialog
 * cannot say WHICH machine, cannot say whether it is currently on the website,
 * and appears at the top of the screen instead of under the thumb that is about
 * to press it.
 *
 * Both sentences below are conditioned on real state rather than written once
 * and hoped for. Telling a worker a draft is "coming off the website" trains
 * them to stop reading the warnings that are true.
 */
export default function DeleteItem({
  id,
  title,
  live,
}: {
  id: string;
  title: string;
  live: boolean;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);

    const result = await softDeleteItem(id);
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }

    // Deliberately still busy: this page no longer exists — getItem() filters
    // deleted rows, so staying here and refreshing would render a 404 at a
    // worker who just did the right thing. `replace` rather than `push` so the
    // back button does not return to the dead page either.
    router.replace("/items");
    router.refresh();
  }

  return (
    <Panel>
      {error && (
        <div className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5 mb-3">
          {error}
        </div>
      )}

      {asking ? (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium tracking-tight">
              Delete {title || "this item"}?
            </p>
            <p className="text-xs font-light text-muted mt-1 leading-relaxed">
              {live
                ? "It comes off the website straight away and leaves the stock list."
                : "It leaves the stock list. It is not on the website, so nothing changes there."}{" "}
              What it cost and what was done to it stay in the record.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="danger" loading={busy} onClick={onDelete}>
              Yes, delete it
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-light text-muted">
            Delete this item — off the website, out of the stock list.
          </p>
          <Button
            variant="danger"
            onClick={() => setAsking(true)}
            aria-label="Delete this item"
            className="shrink-0 px-3"
          >
            <iconify-icon
              icon="solar:trash-bin-trash-linear"
              width="16"
              height="16"
              noobserver=""
            />
          </Button>
        </div>
      )}
    </Panel>
  );
}
