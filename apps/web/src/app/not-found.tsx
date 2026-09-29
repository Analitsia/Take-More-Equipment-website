import BrowseMore from "@/components/BrowseMore";
import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import { site, whatsappLink } from "@/data/site";

export const metadata: Metadata = {
  title: "Not found — Take More",
  robots: { index: false, follow: true },
};

/**
 * The page for a link that leads nowhere.
 *
 * Most of the traffic that lands here followed a link to a machine that has
 * since been unpublished — a WhatsApp forward, a screenshot, a search result a
 * week old. So it does not apologise and stop; it points at the stock that IS
 * on the floor, at the wanted form, and at a person.
 */
export default function NotFound() {
  return (
    <PageShell browse={<BrowseMore />}
      eyebrow="Not Found"
      title="That page is not on the floor any more."
      intro="The link may be out of date, or the machine it pointed at has sold. Everything currently for sale is on the catalogue, and if you were after something specific we can watch for the next one."
      crumbs={[{ label: "Home", href: "/" }, { label: "Not found" }]}
    >
      <ContentSection>
        <div className="bg-card rounded-[2rem] border border-border p-8 sm:p-12 max-w-2xl">
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/#catalogue"
              className="flex-1 flex items-center justify-between gap-3 bg-accent text-background rounded-2xl px-6 py-4 hover:opacity-90 transition-opacity"
            >
              <span className="text-sm font-medium">See what is on the floor</span>
              <iconify-icon icon="solar:arrow-right-linear" width="18" height="18"></iconify-icon>
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
            Would rather just ask?{" "}
            <a
              href={whatsappLink("Hi Take More, I followed a link on your site that no longer works. I was looking for:")}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-accent transition-colors"
            >
              WhatsApp us
            </a>{" "}
            or call {site.phone}.
          </p>
        </div>
      </ContentSection>
    </PageShell>
  );
}
