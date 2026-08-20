"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Panel } from "@takemore/ui";
import { INVOICE_HEADINGS, invoiceFilename, rands, whatsappDigits } from "@takemore/core";
import type { OrderDetail, OrderInvoiceRow } from "@/lib/orders";
import { draftInvoiceMessage } from "@/lib/message";
import { issueInvoice } from "../actions";

/**
 * What the customer takes away.
 *
 * ── The WhatsApp problem, and why this is not one button ──────────────────
 *
 * `wa.me?text=` is the mechanism every other send in this app uses, and it
 * CANNOT carry a file. There is no parameter for one and there never has been;
 * click-to-chat pre-fills a message and stops. So "send them the invoice on
 * WhatsApp" has exactly three implementations and this uses two of them:
 *
 *   1. THE SHARE SHEET. navigator.share() with a File hands the phone's own
 *      share menu the actual PDF, and WhatsApp is one of the destinations in
 *      it. This is the real thing — the document arrives as a document. It is
 *      a phone feature; most desktop browsers cannot share files.
 *
 *   2. wa.me PLUS A DOWNLOAD. Where the file cannot be shared, the PDF is saved
 *      and WhatsApp opens with the message already typed, and the person
 *      attaches it — one extra tap, on the desktop where attaching a file is
 *      easy anyway.
 *
 *   3. The Meta Cloud API, which would attach it with no tap at all, and needs
 *      business verification, an approved template per wording, and a cost per
 *      message. OutreachQueue already made this call for match messages —
 *      "worth it when the tapping gets tedious, not before" — and an invoice is
 *      sent far less often than those are.
 *
 * ── Why the PDF is fetched before anybody clicks ──────────────────────────
 *
 * navigator.share() has to be called during the gesture that triggered it.
 * Awaiting a fetch() first spends that activation, and Safari refuses the share
 * with NotAllowedError — on iPhones, which is most of the phones this will run
 * on. So the file is fetched as soon as the document exists and the handler
 * only ever hands over something it already has. It is about five kilobytes.
 */
export default function InvoicePanel({
  order,
  invoices,
  chargedTotalCents,
  configured,
  onDone,
}: {
  order: OrderDetail;
  invoices: OrderInvoiceRow[];
  /** What the order says the customer pays. Used to spot a document gone stale. */
  chargedTotalCents: number;
  /** Whether this deployment has the business details to put on a document. */
  configured: { ok: boolean; error?: string };
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);

  const paid = order.status === "paid";
  const cancelled = order.status === "void";
  const wantKind = paid ? "invoice" : "proforma";

  // Newest first, so the first match is the one in force.
  const current = invoices.find((i) => i.kind === wantKind) ?? null;

  /**
   * A document that no longer describes the sale.
   *
   * Only checkable for an invoice: a paid order always has an agreed total, so
   * the document's figure and the order's generated `charged_total_cents` must
   * be the same number. They come apart when a sale is reopened, corrected and
   * confirmed again — at which point the invoice in the customer's hand is
   * wrong and somebody has to be told, rather than the screen quietly showing a
   * green tick.
   *
   * A proforma is deliberately not checked: it is issued against an order that
   * is still being negotiated, so its total is expected to move.
   */
  const stale = paid && current !== null && current.total_cents !== chargedTotalCents;

  const url = current ? `/api/invoices/${current.id}` : null;
  const filename = current ? invoiceFilename(current) : null;

  // Fetched up front so the share handler never has to await inside a gesture.
  useEffect(() => {
    if (!url || !filename) {
      setFile(null);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const blob = await response.blob();
        if (alive) setFile(new File([blob], filename, { type: "application/pdf" }));
      } catch {
        // Nothing to do and nothing to say: every button below still works
        // without this, they just take the longer route.
      }
    })();
    return () => {
      alive = false;
    };
  }, [url, filename]);

  const issue = async () => {
    setBusy(true);
    setHint(null);
    const result = await issueInvoice(order.id);
    setBusy(false);
    onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  /**
   * Print.
   *
   * The PDF is loaded into an off-screen iframe and that iframe is told to
   * print, so the paper is byte-for-byte the file the customer gets — there is
   * no second HTML layout that could drift from it.
   *
   * Browsers disagree about whether a script may drive their PDF viewer, and
   * the ones that refuse do so silently. So the fallback is unconditional: if
   * nothing has happened, the document is also opened in a tab where the
   * viewer's own print button is one press away.
   */
  const print = useCallback(() => {
    if (!url) return;
    const node = frame.current;
    if (!node) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setHint(null);
    node.src = url;
    node.onload = () => {
      try {
        node.contentWindow?.focus();
        node.contentWindow?.print();
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    };
    // Said before it might be needed rather than after it has failed, because
    // "nothing happened" is not an event this can detect.
    setHint("If no print dialog appears, the invoice also opens in a new tab — print it from there.");
  }, [url]);

  const send = async () => {
    if (!url || !filename) return;
    setHint(null);

    const digits = whatsappDigits(order.lead?.phone);
    const message = messageFor(current, order);

    // The real thing: the phone's share sheet, with the PDF attached.
    if (file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: message });
        return;
      } catch (error) {
        // AbortError is the person tapping Cancel. Anything else falls through
        // to the route below rather than leaving them with nothing.
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    if (!digits) {
      setHint("There is no usable phone number on this customer. Download it and send it another way.");
      return;
    }

    /**
     * Save the file, then open the chat with the words already typed.
     *
     * The download goes through a synthetic <a download> click rather than a
     * second window.open(). Browsers allow one popup per gesture, so two opens
     * back to back means the second is blocked — and the second is WhatsApp,
     * which is the whole point of the button. A download link is not a popup
     * and does not spend the allowance.
     */
    const save = document.createElement("a");
    save.href = `${url}?download=1`;
    save.download = filename;
    save.rel = "noopener";
    document.body.appendChild(save);
    save.click();
    save.remove();

    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setHint("The invoice has been saved and WhatsApp is open — attach it to the message.");
  };

  if (cancelled && !current) return null;

  return (
    <Panel
      title="Invoice"
      subtitle={
        cancelled
          ? "This sale was cancelled. The documents already issued are kept."
          : paid
            ? undefined
            : "A proforma, with the banking details, for somebody paying by transfer."
      }
    >
      <div className="space-y-3">
        {!configured.ok && (
          <p className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
            {configured.error}
          </p>
        )}

        {current ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium tracking-tight font-mono tracking-widest">
                  {current.number}
                </p>
                <p className="text-[11px] font-light text-muted">
                  {INVOICE_HEADINGS[current.kind]} ·{" "}
                  {new Date(current.issued_at).toLocaleDateString("en-ZA", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums shrink-0">
                {rands(current.total_cents)}
              </span>
            </div>

            {stale && (
              <p className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
                This sale has been corrected since {current.number} went out — it says{" "}
                {rands(current.total_cents)} and the order now says {rands(chargedTotalCents)}. Issue
                a new invoice and send the customer that one.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={send} className="text-xs px-4 py-2">
                Send on WhatsApp
              </Button>
              <Button variant="secondary" onClick={print} className="text-xs px-4 py-2">
                Print
              </Button>
              <a
                href={`${url}?download=1`}
                download={filename ?? undefined}
                className="inline-flex items-center rounded-lg border border-border px-4 py-2
                           text-xs font-light text-white/70 hover:border-white/25 hover:text-white
                           transition-colors"
              >
                Download
              </a>
              <a
                href={url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-1 py-2 text-[11px] font-light text-muted
                           hover:text-white transition-colors"
              >
                Look at it
              </a>
            </div>

            {hint && <p className="text-[11px] font-light text-muted leading-relaxed">{hint}</p>}

            {!cancelled && (
              <div className="border-t border-white/5 pt-3">
                <Button
                  variant="ghost"
                  loading={busy}
                  disabled={!configured.ok}
                  onClick={issue}
                  className="text-xs px-3 py-2"
                >
                  {stale ? `Issue a corrected ${wantKind}` : `Issue another ${wantKind}`}
                </Button>
                <p className="text-[11px] font-light text-muted mt-2 leading-relaxed">
                  {/* Stated plainly because it is the property the whole design
                      rests on, and because a salesperson who thinks this button
                      edits the old document will press it to fix a typo. */}
                  A document that has been handed over is never changed. Issuing another one leaves
                  the first exactly as it was and records which replaced it.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-light text-muted">
              {paid
                ? "Nothing has been issued for this sale yet."
                : "Nothing issued yet. A proforma can go out before the money does."}
            </p>
            <Button
              variant={paid ? "primary" : "secondary"}
              loading={busy}
              disabled={!configured.ok || !order.lead_id}
              onClick={issue}
              className="text-xs px-4 py-2"
            >
              {!order.lead_id
                ? "Add a customer first"
                : paid
                  ? "Make the invoice"
                  : "Make a proforma"}
            </Button>
          </>
        )}

        {/* Off-screen rather than display:none — a hidden iframe is not laid out
            and several browsers refuse to print one that never was. */}
        <iframe
          ref={frame}
          title="Invoice, for printing"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute w-px h-px opacity-0 pointer-events-none -z-10"
        />
      </div>
    </Panel>
  );
}

/**
 * The words that travel with the document.
 *
 * Drafted in lib/message.ts with every other thing this business says to a
 * customer, for the reason that module's own header gives: the rules live in
 * Postgres, the WORDING is a decision about how this business talks, and both
 * belong somewhere they can be found and changed in one place.
 */
const messageFor = (invoice: OrderInvoiceRow | null, order: OrderDetail): string =>
  draftInvoiceMessage({
    kind: invoice?.kind ?? "invoice",
    number: invoice?.number ?? "",
    leadName: order.lead?.full_name ?? null,
    totalCents: invoice?.total_cents ?? 0,
    delivering: order.delivery,
  });
