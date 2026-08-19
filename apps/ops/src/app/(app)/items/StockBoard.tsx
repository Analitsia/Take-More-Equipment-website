"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  STAGES,
  STATUS_LABELS,
  STATUS_ORDER,
  rands,
  type ItemStatus,
} from "@takemore/core";
import { STATUS_CLASSES } from "@takemore/ui";
import { setStage } from "./actions";
import ItemThumb from "@/components/ItemThumb";
import type { ItemRow } from "@/lib/queries";

/**
 * The stock board — every unit, arranged by where it is in the workshop.
 *
 * It is the whole of Stock, and /board renders it too for the dashboard's deep
 * link. No role prop: every move costs `staff`, which is the floor for reaching
 * either surface, so there is nothing left to hide.
 *
 * Moves are buttons rather than drag-and-drop, deliberately. Dragging a card
 * across columns on a phone with one hand and a glove on is worse than tapping,
 * and there are only ever three places a card can go — every stage reaches every
 * other stage directly, so the buttons are the other three stages, always.
 */
export default function StockBoard({ items }: { items: ItemRow[] }) {
  const router = useRouter();
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(id: string, to: ItemStatus) {
    setMoving(id);
    setError(null);
    const result = await setStage(id, to);
    setMoving(null);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <>
      {error && (
        <p className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5 mb-3">
          {error}
        </p>
      )}

      <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        {STATUS_ORDER.map((status) => {
          const column = items.filter((i) => i.status === status);
          const c = STATUS_CLASSES[status];

          return (
            /* Two shapes, one board.

               On a phone and a tablet the columns keep a fixed width and the
               row swipes sideways — four stages will not fit across 500px in
               any arrangement worth reading. From `lg` up they stop being
               fixed and share whatever room the screen has: `flex-1` to take
               an equal quarter, `min-w-0` because a flex child otherwise
               refuses to shrink below the width of its own content, and a cap
               so a wide monitor gives four sensible columns rather than four
               enormous ones. Nothing is ever left over the edge. */
            <section
              key={status}
              className="w-[78vw] sm:w-72 shrink-0 lg:w-auto lg:flex-1 lg:shrink lg:min-w-0
                         lg:max-w-[26rem] bg-card/50 border border-border rounded-2xl
                         flex flex-col max-h-[70vh]"
            >
              <header className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <h2 className={`text-xs font-medium uppercase tracking-wider ${c.text}`}>
                  {STATUS_LABELS[status]}
                </h2>
                <span className="ml-auto text-xs font-light text-muted tabular-nums">
                  {column.length}
                </span>
              </header>

              <div className="board-column flex-1 overflow-y-auto p-2.5 space-y-2.5">
                {column.length === 0 ? (
                  <p className="text-[11px] font-light text-muted text-center py-6">Empty</p>
                ) : (
                  column.map((item) => {
                    // The other three stages. Not filtered by role — every move
                    // costs `staff`, so anyone looking at this board can make
                    // any of them, and anyone who can make one can undo it.
                    const moves = STAGES.filter((s) => s.status !== item.status);

                    return (
                      <article
                        key={item.id}
                        className={`bg-card border border-border rounded-xl overflow-hidden transition-opacity ${
                          moving === item.id ? "opacity-50" : ""
                        }`}
                      >
                        <Link href={`/items/${item.id}`} className="block">
                          <div className="flex gap-2.5 p-2.5">
                            <ItemThumb
                              media={item.media}
                              className="w-11 h-11 rounded-lg"
                              icon={14}
                            />
                            <div className="min-w-0 flex-1">
                              <h3 className="text-xs font-medium tracking-tight leading-snug line-clamp-2">
                                {item.title}
                              </h3>
                              {/* Plain text rather than the ItemCode button:
                                  this whole card is a <Link>, and a <button>
                                  inside an <a> is invalid markup that browsers
                                  resolve by guessing. Copying is a thing you do
                                  on the machine's own page. */}
                              <p className="text-[10px] font-light text-muted mt-1 truncate">
                                <span className="font-mono tracking-widest text-white/60">
                                  {item.sku}
                                </span>
                                {" · "}
                                {item.list_price_cents ? rands(item.list_price_cents) : "No price"}
                              </p>
                            </div>
                            {item.published_at && (
                              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1" title="Live on the site" />
                            )}
                          </div>
                        </Link>

                        {moves.length > 0 && (
                          <div className="flex flex-wrap gap-1 px-2.5 pb-2.5">
                            {moves.map((m) => (
                              <button
                                key={m.status}
                                onClick={() => move(item.id, m.status)}
                                disabled={moving === item.id}
                                className="text-[10px] font-light px-2 py-1 rounded-lg border border-border
                                           text-white/70 hover:border-white/25 hover:text-white
                                           transition-colors disabled:opacity-40"
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
