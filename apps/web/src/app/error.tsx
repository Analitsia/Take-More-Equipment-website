"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@takemore/observability";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import { site, whatsappLink } from "@/data/site";

/**
 * What a visitor sees when a page throws.
 *
 * Next's default is an unstyled "Application error" on a white screen, which
 * on a storefront reads as "this business is gone". This keeps the brand, the
 * navigation and a way to reach a person — and reports the error, because a
 * boundary that swallows it quietly is the failure that hid every bug before
 * observability existed.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { where: "web/error-boundary", digest: error.digest });
  }, [error]);

  return (
    <PageShell
      eyebrow="Something Broke"
      title="That page did not load properly."
      intro="It is on our side, not yours, and it has been logged. Try again in a moment — and if you were in the middle of asking about a machine, WhatsApp us and we will pick it up from there."
      crumbs={[{ label: "Home", href: "/" }, { label: "Error" }]}
    >
      <ContentSection>
        <div className="bg-card rounded-[2rem] border border-border p-8 sm:p-12 max-w-2xl">
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={reset}
              className="flex-1 flex items-center justify-between gap-3 bg-accent text-background rounded-2xl px-6 py-4 hover:opacity-90 transition-opacity"
            >
              <span className="text-sm font-medium">Try again</span>
              <iconify-icon icon="solar:restart-linear" width="18" height="18"></iconify-icon>
            </button>
            <Link
              href="/#catalogue"
              className="flex-1 flex items-center justify-between gap-3 border border-border rounded-2xl px-6 py-4 hover:border-white/25 transition-colors"
            >
              <span className="text-sm font-light">See the stock</span>
              <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
            </Link>
            <Link
              href="/wanted"
              className="flex-1 flex items-center justify-between gap-3 border border-border rounded-2xl px-6 py-4 hover:border-white/25 transition-colors"
            >
              <span className="text-sm font-light">Tell us what you need</span>
              <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
            </Link>
          </div>
          <p className="text-sm font-light text-muted leading-relaxed mt-8 pt-8 border-t border-border">
            <a
              href={whatsappLink("Hi Take More, your website showed an error while I was looking at:")}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-accent transition-colors"
            >
              WhatsApp us
            </a>{" "}
            or call {site.phone} — a person answers both.
          </p>
        </div>
      </ContentSection>
    </PageShell>
  );
}
