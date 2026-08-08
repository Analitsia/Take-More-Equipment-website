"use client";

import { useEffect, useState } from "react";
import { Button } from "@takemore/ui";
import { previewCampaign, sendCampaign, type CampaignPreview, type CampaignResult } from "./actions";

/**
 * See it, then send it.
 *
 * A campaign send is the one action in this system that cannot be walked back.
 * Duplicate sends were already impossible — the draft→sending claim is atomic —
 * but nothing stopped sending the right message once and having it be wrong: a
 * typo in the subject line, an intro naming last month, a machine that sold this
 * morning and should not be in a newsletter going out this afternoon.
 *
 * So: one tap opens this, and the send button lives inside it, under the thing
 * it is going to send. The preview is rendered by the same wrap() the sender
 * uses — not a copy of it, which would drift and then reassure somebody about an
 * email that no longer looks like this.
 *
 * The HTML goes in a sandboxed iframe. It is our own template with our own copy
 * in it, but it is also arbitrary HTML assembled from database rows, and putting
 * that straight into this document would let a customer-supplied string reach
 * the ops app's own origin. `sandbox` with no allow-* flags means no scripts, no
 * forms, no navigation — just paint.
 */
export default function PreviewDialog({
  campaignId,
  campaignName,
  onClose,
  onSent,
}: {
  campaignId: string;
  campaignName: string;
  onClose: () => void;
  onSent: (result: CampaignResult) => void;
}) {
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [sending, setSending] = useState(false);
  const [view, setView] = useState<"html" | "text">("html");

  useEffect(() => {
    let cancelled = false;
    previewCampaign(campaignId).then((result) => {
      if (!cancelled) setPreview(result);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  // Escape closes, and the body does not scroll behind the sheet. Both are the
  // difference between a dialog and a div that happens to be on top.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, sending]);

  const blocked =
    preview?.ok === true && (preview.recipientCount === 0 || preview.items.every((i) => !i.live));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${campaignName}`}
    >
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <header className="flex items-start gap-3 p-4 border-b border-border shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium tracking-tight truncate">{campaignName}</h2>
            <p className="text-[11px] font-light text-muted mt-0.5">
              {preview?.ok
                ? `What ${preview.recipientCount} ${preview.recipientCount === 1 ? "person" : "people"} will receive`
                : "Loading…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
            className="w-8 h-8 shrink-0 rounded-xl border border-border flex items-center justify-center text-muted hover:text-white hover:border-white/25 transition-colors disabled:opacity-40"
          >
            <iconify-icon icon="solar:close-circle-linear" width="16" height="16"></iconify-icon>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {!preview && <p className="text-xs font-light text-muted">Working it out…</p>}

          {preview && !preview.ok && (
            <p className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
              {preview.error}
            </p>
          )}

          {preview?.ok && (
            <>
              {preview.warnings.map((warning) => (
                <p
                  key={warning}
                  className="text-xs font-light text-status-refurbishing bg-status-refurbishing/10 border border-status-refurbishing/30 rounded-xl px-3 py-2.5"
                >
                  {warning}
                </p>
              ))}

              {/* The envelope. Subject and sender are what a person sees before
                  they open anything, and are the most common thing to get
                  wrong — so they are shown as the header, not buried. */}
              <dl className="bg-background border border-border rounded-xl p-3 flex flex-col gap-1.5 text-[11px]">
                <Row label="From" value={preview.from} />
                {preview.replyTo && <Row label="Reply to" value={preview.replyTo} />}
                <Row label="Subject" value={preview.subject} strong />
                <Row
                  label="To"
                  value={`${preview.recipientCount} ${preview.recipientCount === 1 ? "person who agreed" : "people who agreed"} to emails`}
                />
              </dl>

              <ul className="flex flex-col gap-1">
                {preview.items.map((item) => (
                  <li
                    key={item.title}
                    className={`flex items-center gap-2 text-[11px] font-light ${
                      item.live ? "text-white/80" : "text-muted line-through"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        item.live ? "bg-accent" : "bg-muted"
                      }`}
                    />
                    <span className="truncate">{item.title}</span>
                    {item.price && <span className="tabular-nums shrink-0">{item.price}</span>}
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-1 p-1 bg-background border border-border rounded-xl self-start">
                {(
                  [
                    ["html", "As it looks"],
                    ["text", "Plain text"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setView(value)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      view === value ? "bg-accent text-background" : "text-muted hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {view === "html" ? (
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview.html}
                  className="w-full h-[420px] rounded-xl border border-border bg-white"
                />
              ) : (
                <pre className="w-full h-[420px] overflow-auto rounded-xl border border-border bg-background p-3 text-[11px] font-light leading-relaxed whitespace-pre-wrap">
                  {preview.text}
                </pre>
              )}
            </>
          )}
        </div>

        <footer className="p-4 border-t border-border shrink-0 flex items-center gap-3">
          <p className="text-[11px] font-light text-muted flex-1">
            {/* Said here rather than in a confirm() the browser draws, because
                this is the moment it matters and this is where the eyes are. */}
            Sending cannot be undone.
          </p>
          <Button variant="ghost" onClick={onClose} disabled={sending} className="text-[11px] px-3 py-1.5">
            Not yet
          </Button>
          <Button
            loading={sending}
            disabled={!preview?.ok || blocked || sending}
            className="text-[11px] px-3 py-1.5"
            onClick={async () => {
              setSending(true);
              const result = await sendCampaign(campaignId);
              setSending(false);
              onSent(result);
              if (result.ok) onClose();
            }}
          >
            {preview?.ok ? `Send it to ${preview.recipientCount}` : "Send it"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-muted w-16 shrink-0">{label}</dt>
      <dd className={`min-w-0 break-words ${strong ? "font-medium text-white" : "font-light text-white/80"}`}>
        {value}
      </dd>
    </div>
  );
}
