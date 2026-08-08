"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@takemore/ui";
import { rands, type OutreachChannel } from "@takemore/core";
import { markSent, runMatchNow, sendByEmail, skipMessage, type OutreachResult } from "./actions";

export type QueueEntry = {
  id: string;
  channel: OutreachChannel;
  reason: string | null;
  score: number | null;
  leadId: string;
  leadName: string | null;
  leadEmail: string | null;
  leadPhoneDigits: string | null;
  itemTitle: string;
  itemSlug: string;
  itemUrl: string;
  itemImage: string | null;
  itemPriceCents: number | null;
  draft: string;
};

/**
 * The queue, grouped by machine.
 *
 * Grouping matters more than it looks. Ungrouped, this is a list of forty
 * strangers and every one needs its own decision. Grouped, it is "the Blue Seal
 * came in — four people wanted one of these", which is a single judgement about
 * a machine followed by four taps.
 */
export default function OutreachQueue({
  entries,
  canRunMatch,
}: {
  entries: QueueEntry[];
  canRunMatch: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const report = (result: OutreachResult) => {
    if (result.ok) {
      setError(null);
      setNotice(result.notice ?? null);
      router.refresh();
    } else {
      setNotice(null);
      setError(result.error);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, QueueEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.itemSlug) ?? [];
      list.push(entry);
      map.set(entry.itemSlug, list);
    }
    return [...map.values()].sort((a, b) => b.length - a.length);
  }, [entries]);

  return (
    <>
      {(error || notice) && (
        <div
          className={`text-xs rounded-xl px-3 py-2.5 mb-4 border ${
            error
              ? "text-status-sold bg-status-sold/10 border-status-sold/30"
              : "text-accent bg-accent/10 border-accent/30"
          }`}
        >
          {error ?? notice}
        </div>
      )}

      {canRunMatch && (
        <div className="mb-4">
          <Button
            variant="secondary"
            loading={busy}
            className="text-xs px-4 py-2"
            onClick={async () => {
              setBusy(true);
              report(await runMatchNow());
              setBusy(false);
            }}
          >
            Look for more matches now
          </Button>
        </div>
      )}

      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group[0].itemSlug} className="bg-card border border-border rounded-2xl">
            <header className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-white/5">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-background border border-border shrink-0">
                {group[0].itemImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={group[0].itemImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted">
                    <iconify-icon icon="solar:camera-linear" width="16" height="16" noobserver="" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-medium tracking-tight truncate">
                  {group[0].itemTitle}
                </h2>
                <p className="text-[11px] font-light text-muted">
                  {[
                    group[0].itemPriceCents ? rands(group[0].itemPriceCents) : null,
                    `${group.length} ${group.length === 1 ? "person wants" : "people want"} one`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <a
                href={group[0].itemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-light text-muted hover:text-white transition-colors shrink-0"
              >
                View page
              </a>
            </header>

            <div className="divide-y divide-white/5">
              {group.map((entry) => (
                <Suggestion key={entry.id} entry={entry} onResult={report} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function Suggestion({
  entry,
  onResult,
}: {
  entry: QueueEntry;
  onResult: (result: OutreachResult) => void;
}) {
  const [body, setBody] = useState(entry.draft);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    if (entry.channel === "email") {
      onResult(await sendByEmail(entry.id, body));
    } else if (entry.leadPhoneDigits) {
      // The staff member is the sender: WhatsApp opens with the message already
      // written, they press send in WhatsApp, and we record that it went. The
      // Meta Cloud API would do this without the tap, at about R1.50 a message
      // and a template approval per wording — worth it when the tapping gets
      // tedious, not before.
      window.open(
        `https://wa.me/${entry.leadPhoneDigits}?text=${encodeURIComponent(body)}`,
        "_blank",
        "noopener,noreferrer"
      );
      onResult(await markSent(entry.id, body));
    } else {
      onResult({ ok: false, error: "No usable phone number on file." });
    }
    setBusy(false);
  };

  return (
    <div className="px-4 sm:px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <Link
            href={`/leads/${entry.leadId}`}
            className="text-sm font-medium tracking-tight hover:text-accent transition-colors"
          >
            {entry.leadName || entry.leadEmail || "Unnamed"}
          </Link>
          {entry.reason && (
            <p className="text-[11px] font-light text-muted mt-0.5 leading-relaxed">
              {entry.reason}
            </p>
          )}
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-light border shrink-0 ${
            entry.channel === "whatsapp"
              ? "border-accent/40 text-accent"
              : "border-border text-muted"
          }`}
        >
          {entry.channel === "whatsapp" ? "WhatsApp" : "Email"}
        </span>
      </div>

      {editing ? (
        <Textarea
          value={body}
          rows={8}
          onChange={(e) => setBody(e.target.value)}
          className="text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full text-left bg-background border border-border rounded-xl p-3
                     hover:border-white/20 transition-colors"
        >
          <p className="text-[11px] font-light text-white/75 leading-relaxed whitespace-pre-wrap">
            {body}
          </p>
          <span className="block text-[10px] text-muted mt-2">Tap to change the wording</span>
        </button>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <Button onClick={send} loading={busy} className="text-xs px-4 py-2">
          {entry.channel === "whatsapp" ? "Open WhatsApp" : "Send email"}
        </Button>
        <Button
          variant="ghost"
          className="text-xs px-3 py-2"
          onClick={async () => {
            setBusy(true);
            onResult(await skipMessage(entry.id, "Not right for them"));
            setBusy(false);
          }}
        >
          Not this one
        </Button>
        {entry.score !== null && (
          <span className="ml-auto text-[10px] font-light text-muted tabular-nums">
            match {entry.score}
          </span>
        )}
      </div>
    </div>
  );
}
