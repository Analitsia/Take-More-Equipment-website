import { NextResponse } from "next/server";
import { reportError } from "@takemore/observability";
import { invoiceFilename } from "@takemore/core";
import { currentStaff } from "@/lib/supabase";
import { getInvoiceDocument } from "@/lib/orders";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

/**
 * One issued document, as a PDF.
 *
 * The invoice is the resource, not the order — an order can have several
 * (a proforma, then an invoice, then a corrected invoice after a reopen) and
 * every one of them stays reachable for ever. A URL that meant "the current
 * invoice for this order" would silently start returning a different document
 * than the one somebody bookmarked, which is the exact failure the stored
 * snapshot exists to prevent.
 *
 * ── Why the Node runtime ──────────────────────────────────────────────────
 * @react-pdf/renderer needs Buffer and the font machinery underneath it. Edge
 * would be cheaper and cannot run this.
 *
 * ── Why not requireStaff() ────────────────────────────────────────────────
 * That redirects to /login, which is right for a page and wrong here: the
 * WhatsApp button fetches this with fetch(), and a 307 to an HTML login form
 * arrives as a "PDF" the browser cannot open. A 401 is the truth and the caller
 * can say so.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await currentStaff();
  if (!staff) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;

  // RLS decides. "staff read invoices" is the only policy on this table, so an
  // account that may not see the sale gets a not-found rather than a refusal,
  // which is also the answer that leaks least.
  let doc;
  try {
    doc = await getInvoiceDocument(id);
  } catch (cause) {
    reportError(cause, { where: "api/invoices/read" });
    return NextResponse.json({ error: "Could not read that invoice." }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "No such invoice." }, { status: 404 });
  }

  let pdf: Buffer;
  try {
    pdf = await renderInvoicePdf(doc);
  } catch (cause) {
    // renderInvoicePdf() refuses a document whose figures do not tie. Loud
    // rather than a broken file: a PDF that disagrees with itself is worse than
    // an error, because it gets handed over.
    reportError(cause, { where: "api/invoices/render", invoice: doc?.number });
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "That invoice could not be drawn." },
      { status: 500 }
    );
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = invoiceFilename(doc);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // `inline` opens it in the browser's own PDF viewer, which is what the
      // print button wants. `attachment` is the download button.
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(pdf.length),
      /**
       * Immutable is not optimism here, it is the schema: order_invoices has no
       * UPDATE policy, so this id can never render anything different. `private`
       * because the document carries a named person's address and what they
       * bought — it may sit in this browser's cache and nowhere else.
       */
      "Cache-Control": "private, max-age=31536000, immutable",
      // Belt and braces: the document is behind a login, but it is also the
      // kind of thing that must never end up in a search index.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
