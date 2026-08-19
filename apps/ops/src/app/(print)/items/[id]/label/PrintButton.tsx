"use client";

/**
 * The one interactive thing on a page whose job is to stop being a page.
 *
 * A client component of its own so the label itself stays a server component —
 * `window.print` is the only reason any of this needs JavaScript, and paying
 * for a client bundle on the whole page to get one button would be the wrong
 * trade on a warehouse connection.
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-black/20 px-3 py-1.5 text-xs font-medium
                 hover:bg-black hover:text-white transition-colors"
    >
      Print
    </button>
  );
}
