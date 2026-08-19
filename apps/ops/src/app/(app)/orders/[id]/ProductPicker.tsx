"use client";

import { useCallback, useState } from "react";
import { createBrowserClient } from "@takemore/db";
import { StatusPill } from "@takemore/ui";
import { normaliseItemCode, rands, type ItemStatus } from "@takemore/core";
import { useLiveSearch } from "@/lib/useLiveSearch";
import { addLine } from "../actions";

type Sellable = {
  id: string;
  sku: string;
  title: string;
  subtitle: string | null;
  status: ItemStatus;
  list_price_cents: number | null;
  on_order: string | null;
};

/**
 * Putting machines on the order.
 *
 * Two doors into one function. Typing `A042` and pressing Enter goes straight
 * to add_order_line(), which resolves the code in SQL — so "no machine has that
 * code" and "A042 is already on ORD-0009" are answers from the thing that
 * knows, rather than guesses made here. Typing anything else searches, and the
 * list is the confirmation step: a four-character code is short enough to
 * mistype, and seeing the machine's name before adding it is what catches that.
 *
 * search_sellable_items rather than search_everything, because the two want
 * opposite things — the command palette must find a sold machine, and this must
 * not be able to add one.
 */
export default function ProductPicker({
  orderId,
  onDone,
}: {
  orderId: string;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(
    async (term: string): Promise<Sellable[]> => {
      const client = createBrowserClient();
      const { data } = await client.rpc("search_sellable_items", {
        p_query: term,
        p_limit: 8,
        p_order_id: orderId,
      });
      return (data ?? []) as unknown as Sellable[];
    },
    [orderId]
  );

  const { hits, loading, tooShort } = useLiveSearch<Sellable>(query, fetcher);

  const add = async (ref: { code?: string; itemId?: string }) => {
    setBusy(true);
    const result = await addLine(orderId, ref);
    setBusy(false);
    if (result.ok) setQuery("");
    onDone(
      result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error }
    );
  };

  // Enter means "I typed a code and I mean it". Only when it IS a code —
  // pressing Enter after typing "fryer" should do nothing rather than produce
  // an error about a machine called fryer.
  const typedCode = normaliseItemCode(query);

  return (
    <div className="space-y-3">
      <div className="relative">
        <iconify-icon
          icon="solar:magnifer-linear"
          width="16"
          height="16"
          noobserver=""
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && typedCode && !busy) {
              e.preventDefault();
              add({ code: typedCode });
            }
          }}
          disabled={busy}
          placeholder="A code like A042, or a name"
          autoComplete="off"
          className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm font-light
                     text-white/90 placeholder:text-muted/60 hover:border-white/20
                     focus:border-accent focus:outline-none transition-colors disabled:opacity-50"
        />
        {typedCode && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-light text-muted">
            Enter to add {typedCode}
          </span>
        )}
      </div>

      {tooShort ? (
        <p className="text-[11px] font-light text-muted">
          Type a code, or two letters of a machine&apos;s name.
        </p>
      ) : hits.length === 0 && !loading ? (
        <p className="text-[11px] font-light text-muted">Nothing available matches that.</p>
      ) : (
        <ul className="space-y-1.5">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                disabled={busy || Boolean(hit.on_order)}
                onClick={() => add({ itemId: hit.id })}
                className="w-full text-left bg-background border border-border rounded-xl px-3 py-2.5
                           hover:border-white/25 transition-colors disabled:opacity-50
                           disabled:cursor-not-allowed flex items-center gap-3"
              >
                <span className="font-mono text-[11px] tracking-widest tabular-nums text-white/60 shrink-0">
                  {hit.sku}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-light text-white/90 truncate">
                    {hit.title}
                  </span>
                  <span className="block text-[11px] text-muted truncate">
                    {hit.on_order
                      ? // Shown rather than hidden: a salesperson who cannot
                        // find a machine assumes the search is broken. One who
                        // reads "on ORD-0009" knows who to go and ask.
                        `Already on ${hit.on_order}`
                      : [hit.subtitle, hit.list_price_cents ? rands(hit.list_price_cents) : "No price"]
                          .filter(Boolean)
                          .join(" · ")}
                  </span>
                </span>
                <StatusPill status={hit.status} size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
