import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Subheading from "@/components/Subheading";
import { Breadcrumbs } from "@/components/PageShell";
import { Prose } from "@/components/Prose";
import { formatDate, postBySlug, posts } from "@/data/posts";
import { whatsappLink } from "@/data/site";

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return { title: "Not found — Take More" };

  return {
    title: `${post.title} — Take More`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [post.image],
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();

  const more = posts.filter((other) => other.slug !== post.slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar variant="solid" />

      <article className="flex-1 w-full max-w-[1440px] mx-auto px-6 md:px-12 pt-4 md:pt-8 pb-16 md:pb-24">
        <Breadcrumbs
          crumbs={[
            { label: "Home", href: "/" },
            { label: "Journal", href: "/blog" },
            { label: post.tag },
          ]}
        />

        <header className="max-w-3xl mb-8 md:mb-12">
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <span className="px-4 py-1.5 rounded-full bg-accent text-background text-xs font-medium tracking-widest uppercase">
              {post.tag}
            </span>
            <span className="text-xs font-light text-muted">
              {formatDate(post.date)} · {post.readingMinutes} min read
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-medium tracking-tighter leading-[1.12] mb-6 md:mb-8">
            {post.title}
          </h1>
          <p className="text-base md:text-lg font-light text-white/80 leading-relaxed">
            {post.excerpt}
          </p>
        </header>

        <div className="rounded-[2rem] overflow-hidden border border-border mb-10 md:mb-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image}
            alt={post.title}
            className="w-full aspect-[3/2] sm:aspect-[21/9] object-cover"
          />
        </div>

        <Prose blocks={post.body} />

        <div className="max-w-2xl mt-16 pt-10 border-t border-border">
          <h2 className="text-2xl font-medium tracking-tight mb-4">
            Want a second opinion before you buy?
          </h2>
          <p className="text-muted font-light text-sm leading-relaxed mb-8">
            Send us the listing you are looking at — ours or anyone else's. We will tell
            you what we would check and what we think it is worth.
          </p>
          <a
            href={whatsappLink(
              "Hi Take More, I'm looking at a used unit — can you tell me what to check?"
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-4 group"
          >
            <span className="text-lg font-light group-hover:text-accent transition-colors">
              Ask us on WhatsApp
            </span>
            <span className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-background group-hover:scale-105 transition-transform">
              <iconify-icon icon="solar:chat-round-line-linear" width="20" height="20"></iconify-icon>
            </span>
          </a>
        </div>

        {more.length > 0 && (
          <section className="mt-16 md:mt-24">
            <Subheading text="Keep Reading" />
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-12">
              More from the workshop
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {more.map((other) => (
                <Link
                  key={other.slug}
                  href={`/blog/${other.slug}`}
                  className="group bg-card rounded-[2rem] border border-border overflow-hidden hover:border-white/10 transition-colors flex flex-col"
                >
                  <div className="relative h-48 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={other.image}
                      alt={other.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent"></div>
                  </div>
                  <div className="p-8">
                    <span className="text-xs font-light text-muted">
                      {other.tag} · {other.readingMinutes} min read
                    </span>
                    <h3 className="text-xl font-medium tracking-tight leading-snug mt-3 group-hover:text-accent transition-colors">
                      {other.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>

      <Footer />
    </div>
  );
}
