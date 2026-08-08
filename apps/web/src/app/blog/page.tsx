import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import { formatDate, posts } from "@/data/posts";

export const metadata: Metadata = {
  title: "Journal — Take More",
  description:
    "Buying guides and notes from the workshop: what equipment should actually cost, what to check before you pay, and how we grade and warranty condition.",
};

export default function BlogIndexPage() {
  const [lead, ...rest] = posts;

  // Nothing verified yet. This used to be a crash rather than an empty page:
  // `lead` was undefined and `lead.slug` threw during the static build.
  if (!lead) {
    return (
      <PageShell
        eyebrow="Journal"
        title={<>Notes from the workshop, shortly.</>}
        intro="We are writing up what we have learnt rebuilding kitchens — what equipment should actually cost, what to check before you pay, and the reasoning behind how we grade. It goes up here once the numbers in it have been checked."
        crumbs={[{ label: "Home", href: "/" }, { label: "Journal" }]}
      >
        <ContentSection>
          <div className="bg-card rounded-[2rem] border border-border p-8 sm:p-12 max-w-2xl">
            <p className="text-muted font-light text-sm md:text-base leading-relaxed mb-8">
              In the meantime, the two things people ask us most are already
              written down and are not going to change.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/conditions"
                className="inline-flex items-center gap-3 border border-border rounded-2xl px-6 py-4 hover:border-white/25 transition-colors"
              >
                <span className="text-sm font-light">How we grade and warranty</span>
                <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
              </Link>
              <Link
                href="/delivery"
                className="inline-flex items-center gap-3 border border-border rounded-2xl px-6 py-4 hover:border-white/25 transition-colors"
              >
                <span className="text-sm font-light">Delivery and installation</span>
                <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
              </Link>
            </div>
          </div>
        </ContentSection>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Journal"
      title={<>What we learn rebuilding kitchens for a living.</>}
      intro="Real prices, what to check before you pay for any machine, and the reasoning behind how we grade and warranty equipment. Written for people spending their own money on a kitchen."
      crumbs={[{ label: "Home", href: "/" }, { label: "Journal" }]}
    >
      <ContentSection>
        <Link
          href={`/blog/${lead.slug}`}
          className="group grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center bg-card rounded-[2rem] border border-border overflow-hidden hover:border-white/10 transition-colors"
        >
          <div className="relative h-52 sm:h-64 lg:h-full lg:min-h-[380px] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lead.image}
              alt={lead.imageAlt}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent"></div>
          </div>

          <div className="p-6 sm:p-8 lg:p-12 lg:pl-0">
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <span className="px-4 py-1.5 rounded-full bg-accent text-background text-xs font-medium tracking-widest uppercase">
                {lead.tag}
              </span>
              <span className="text-xs font-light text-muted">
                {formatDate(lead.date)} · {lead.readingMinutes} min read
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tighter leading-[1.15] mb-4 sm:mb-5 group-hover:text-accent transition-colors">
              {lead.title}
            </h2>
            <p className="text-muted font-light text-sm leading-relaxed mb-8">
              {lead.excerpt}
            </p>
            <span className="inline-flex items-center gap-3 text-sm font-light">
              <span className="group-hover:text-accent transition-colors">Read it</span>
              <span className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center group-hover:border-accent transition-colors">
                <iconify-icon icon="solar:arrow-right-linear" width="14" height="14"></iconify-icon>
              </span>
            </span>
          </div>
        </Link>
      </ContentSection>

      {/* One verified post means a lead card and nothing else — an empty grid
          section below it would just be a band of padding. */}
      {rest.length > 0 && (
      <ContentSection>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {rest.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group bg-card rounded-[2rem] border border-border overflow-hidden hover:border-white/10 transition-colors flex flex-col"
            >
              <div className="relative h-44 sm:h-52 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.image}
                  alt={post.imageAlt}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent"></div>
                <span className="absolute top-5 left-5 glass-panel px-4 py-1.5 rounded-full text-xs font-medium tracking-widest uppercase">
                  {post.tag}
                </span>
              </div>

              <div className="p-6 sm:p-8 flex flex-col flex-1">
                <span className="text-xs font-light text-muted mb-4">
                  {formatDate(post.date)} · {post.readingMinutes} min read
                </span>
                <h3 className="text-xl font-medium tracking-tight leading-snug mb-4 group-hover:text-accent transition-colors">
                  {post.title}
                </h3>
                <p className="text-muted font-light text-sm leading-relaxed mb-8">
                  {post.excerpt}
                </p>
                <span className="mt-auto inline-flex items-center gap-3 text-sm font-light group-hover:text-accent transition-colors">
                  <span>Read it</span>
                  <iconify-icon icon="solar:arrow-right-linear" width="14" height="14"></iconify-icon>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </ContentSection>
      )}
    </PageShell>
  );
}
