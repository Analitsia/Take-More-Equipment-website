"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@takemore/ui";
import { rands } from "@takemore/core";
import type { MatchingItem } from "@/lib/leads";
import { emailLeadAboutItem } from "../../outreach/actions";
import type { ActionResult } from "../actions";

/**
 * What we have on the floor, right now, for ONE of this person's wants.
 *
 * The counterpart to "Who wants this" on a machine's page, and the reason it
 * hangs off the want rather than off the person: somebody who asked for a fryer
 * in March and a cold room in June has two of these lists, and each one sends
 * its own email quoting its own sentence. A single list on the person would
 * inevitably become a single email listing both machines, which is a catalogue
 * — and a catalogue is the thing this whole feature exists not to send.
 *
 * The button sends immediately. There is no textarea here on purpose: the queue
 * is where a draft gets edited, and this is the path for somebody who already
 * knows the pairing is right. The wording is composed from the want's own words
 * by the same function the queue uses, so it is the same email either way.
 */
export default function StockForWant({
  leadId,
  interestId,
  canEmail,
  matches,
  onResult,
}: {
  leadId: string;
  interestId: string;
  /** Consent, an address, and no opt-out. Without it we may phone, not write. */
  canEmail: boolean;
  matches: MatchingItem[];
  onResult: (result: ActionResult) => void;
}) {
  const [sending, setSending] = useState<string | null>(null);

  if (matches.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-white/5">
      <p className="text-[11px] font-light text-muted mb-2">
        {matches.length === 1
          ? "One machine on the floor answers this"
          : `${matches.length} machines on the floor answer this`}
      </p>

      <ul className="space-y-2">
        {matches.slice(0, 4).map((item) => (
          <li
            key={item.item_id}
            className="flex items-center gap-3 bg-card border border-border rounded-xl p-2.5"
          >
            <div className="w-11 h-11 rounded-lg overflow-hidden bg-background border border-border shrink-0">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted">
                  <iconify-icon icon="solar:camera-linear" width="14" height="14" noobserver="" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <Link
                href={`/items/${item.item_id}`}
                className="block text-xs font-medium tracking-tight truncate hover:text-accent transition-colors"
              >
                {[item.brand, item.title].filter(Boolean).join(" ")}
              </Link>
              <p className="text-[11px] font-light text-muted tabular-nums">
                {[
                  item.list_price_cents ? rands(item.list_price_cents) : null,
                  item.condition_grade ? `Grade ${item.condition_grade}` : null,
                  `match ${item.score}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            {item.already_told ? (
              <span className="text-[10px] font-light text-muted shrink-0">Already told them</span>
            ) : !canEmail ? (
              // Deliberately a sentence rather than a greyed-out button with no
              // explanation: the fix is one panel further down this same page.
              <span className="text-[10px] font-light text-muted shrink-0 text-right max-w-[7.5rem]">
                No email consent yet
              </span>
            ) : (
              <Button
                variant="secondary"
                loading={sending === item.item_id}
                className="text-[11px] px-3 py-1.5 shrink-0"
                onClick={async () => {
                  setSending(item.item_id);
                  onResult(await emailLeadAboutItem(leadId, interestId, item.item_id));
                  setSending(null);
                }}
              >
                Email them about it
              </Button>
            )}
          </li>
        ))}
      </ul>

      {matches.length > 4 && (
        <p className="text-[10px] font-light text-muted mt-2">
          and {matches.length - 4} more — the whole list is on{" "}
          <Link href="/items" className="text-white/70 hover:text-accent transition-colors">
            stock
          </Link>
          .
        </p>
      )}
    </div>
  );
}
