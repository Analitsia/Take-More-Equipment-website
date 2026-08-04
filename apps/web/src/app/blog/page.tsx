import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import { formatDate, posts } from "@/data/posts";

export const metadata: Metadata = {
  title: "Journal — Take More",
  description:
    "Buying guides and notes from the workshop: what used equipment should cost, what we check at auction, and how we grade condition.",
};

export default function BlogIndexPage() {
  const [lead, ...rest] = posts;

  return (
    <PageShell
      eyebrow="Journal"
      title={<>What we learn buying kitchens for a living.</>}
      intro="Pricing guides, auction notes and the reasoning behind how we grade and warranty equipment. Written for people spending their own money on a kitchen."
      crumbs={[{ label: "Home", href: "/" }, { label: "Journal" }]}
    >
      <ContentSection>
        <Link
          href={`/blog/${lead.slug}`}
          className="group grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center bg-card rounded-[2rem] border border-border overflow-hidden hover:border-white/10 transition-colors"
        >
          <div className="relative h-64 lg:h-full lg:min-h-[380px] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lead.image}
              alt={lead.title}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent"></div>
          </div>

          <div className="p-8 lg:p-12 lg:pl-0">
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <span className="px-4 py-1.5 rounded-full bg-accent text-background text-xs font-medium tracking-widest uppercase">
                {lead.tag}
              </span>
              <span className="text-xs font-light text-muted">
                {formatDate(lead.date)} · {lead.readingMinutes} min read
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tighter leading-[1.15] mb-5 group-hover:text-accent transition-colors">
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

      <ContentSection>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rest.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group bg-card rounded-[2rem] border border-border overflow-hidden hover:border-white/10 transition-colors flex flex-col"
            >
              <div className="relative h-52 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.image}
                  alt={post.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent"></div>
                <span className="absolute top-5 left-5 glass-panel px-4 py-1.5 rounded-full text-xs font-medium tracking-widest uppercase">
                  {post.tag}
                </span>
              </div>

              <div className="p-8 flex flex-col flex-1">
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
    </PageShell>
  );
}
