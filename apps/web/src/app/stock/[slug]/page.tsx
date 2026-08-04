import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Subheading from "@/components/Subheading";
import EquipmentCard from "@/components/EquipmentCard";
import ProductGallery from "@/components/ProductGallery";
import { Breadcrumbs } from "@/components/PageShell";
import {
  WARRANTY_MONTHS,
  bySlug,
  deliveryFor,
  mm,
  rands,
  relatedTo,
  stock,
} from "@/data/equipment";
import { site, whatsappLink } from "@/data/site";

export function generateStaticParams() {
  return stock.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = bySlug(slug);
  if (!item) return { title: "Not found — Take More" };

  return {
    title: `${item.brand} ${item.title} — ${rands(item.price)} | Take More`,
    description: item.description.slice(0, 155),
    openGraph: {
      title: `${item.brand} ${item.title} — ${rands(item.price)}`,
      description: item.description.slice(0, 155),
      images: [item.images[0]],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = bySlug(slug);
  if (!item) notFound();

  const saving = item.retailPrice
    ? Math.round(((item.retailPrice - item.price) / item.retailPrice) * 100)
    : null;
  const delivery = deliveryFor(item);
  const related = relatedTo(item);
  const [width, depth, height] = item.dimensionsMm;

  const specs: [string, string][] = [
    ["Brand", item.brand],
    ["Category", item.category],
    ["Capacity", item.capacity],
    ["Power", item.power],
    ["Width", mm(width)],
    ["Depth", mm(depth)],
    ["Height", mm(height)],
    ["Weight", `${item.weightKg} kg`],
    ["Condition", `Grade ${item.grade}`],
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar variant="solid" />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 md:px-12 pt-4 md:pt-8 pb-16 md:pb-24">
        <Breadcrumbs
          crumbs={[
            { label: "Home", href: "/" },
            { label: "Stock", href: "/#catalogue" },
            { label: item.category, href: "/#catalogue" },
            { label: item.title },
          ]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10 lg:gap-16">
          <ProductGallery images={item.images} title={item.title} sold={item.sold} />

          <div className="flex flex-col">
            <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5 flex-wrap">
              <span className="glass-panel px-4 py-1.5 rounded-full text-xs font-medium tracking-widest uppercase">
                {item.brand}
              </span>
              <span className="px-4 py-1.5 rounded-full border border-border text-xs font-light text-muted">
                {item.category}
              </span>
              <span className="px-4 py-1.5 rounded-full border border-border text-xs font-light text-muted">
                Grade {item.grade}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tighter leading-[1.1] mb-6">
              {item.title}
            </h1>

            <p className="text-muted font-light text-sm md:text-base leading-relaxed mb-6 md:mb-8">
              {item.description}
            </p>

            {/* Price block */}
            <div className="bg-card rounded-[2rem] border border-border p-5 sm:p-6 md:p-8 mb-4 sm:mb-6">
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <div className="flex flex-col">
                  <span className="text-xs text-muted font-light mb-1">
                    {item.sold ? "Sold for" : "Our price"}
                  </span>
                  <span className="text-3xl sm:text-4xl md:text-5xl font-light tracking-tighter">
                    {rands(item.price)}
                  </span>
                </div>
                {item.retailPrice && (
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-light text-muted line-through">
                      {rands(item.retailPrice)} new
                    </span>
                    {saving !== null && (
                      <span className="text-accent text-lg font-light tracking-tight">
                        Save {saving}%
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                {item.sold ? (
                  <a
                    href={whatsappLink(
                      `Hi Take More, the ${item.brand} ${item.title} has sold — can you watch for another one like it?`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-between gap-3 bg-accent text-background rounded-2xl px-6 py-4 hover:opacity-90 transition-opacity"
                  >
                    <span className="text-sm font-medium">Find me one like it</span>
                    <iconify-icon icon="solar:arrow-right-linear" width="18" height="18"></iconify-icon>
                  </a>
                ) : (
                  <a
                    href={whatsappLink(
                      `Hi Take More, I'm interested in the ${item.brand} ${item.title} (${rands(item.price)}). Is it still available?`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-between gap-3 bg-accent text-background rounded-2xl px-6 py-4 hover:opacity-90 transition-opacity"
                  >
                    <span className="text-sm font-medium">Enquire on WhatsApp</span>
                    <iconify-icon icon="solar:chat-round-line-linear" width="18" height="18"></iconify-icon>
                  </a>
                )}
                <a
                  href={`tel:${site.phone.replace(/\s/g, "")}`}
                  className="flex-1 flex items-center justify-between gap-3 border border-border rounded-2xl px-6 py-4 hover:border-white/25 transition-colors"
                >
                  <span className="text-sm font-light">{site.phone}</span>
                  <iconify-icon
                    icon="solar:phone-linear"
                    width="18"
                    height="18"
                    className="text-accent"
                  ></iconify-icon>
                </a>
              </div>

              {!item.sold && (
                <p className="text-xs font-light text-muted mt-5">
                  One of one — when it goes, it goes. We hold a unit for 24 hours on a
                  deposit.
                </p>
              )}
            </div>

            {/* Delivery + warranty */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoCard
                icon="solar:delivery-linear"
                title={delivery.headline}
                copy={delivery.detail}
              />
              <InfoCard
                icon="solar:shield-check-linear"
                title={`${WARRANTY_MONTHS}-month warranty`}
                copy="Parts and labour in writing. If it fails inside six months we collect it, repair it and return it at our cost."
              />
            </div>
          </div>
        </div>

        {/* Specs + workshop notes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10 lg:gap-16 mt-16 md:mt-24">
          <section>
            <Subheading text="Specification" />
            <h2 className="text-xl sm:text-2xl md:text-3xl font-medium tracking-tight mb-8">
              The numbers
            </h2>
            <dl className="flex flex-col">
              {specs.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-6 py-3.5 border-b border-border"
                >
                  <dt className="text-sm font-light text-muted">{label}</dt>
                  <dd className="text-sm font-light text-white/90 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <Subheading text="Workshop Report" />
            <h2 className="text-xl sm:text-2xl md:text-3xl font-medium tracking-tight mb-8">
              What we replaced
            </h2>
            <ul className="flex flex-col gap-4">
              {item.workshopNotes.map((note) => (
                <li key={note} className="flex items-start gap-4">
                  <span className="w-6 h-6 rounded-lg bg-card border border-border flex items-center justify-center text-accent shrink-0 mt-0.5">
                    <iconify-icon icon="solar:check-read-linear" width="12" height="12"></iconify-icon>
                  </span>
                  <span className="text-sm font-light text-muted leading-relaxed">
                    {note}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-8 pt-8 border-t border-border">
              <p className="text-sm font-light text-muted leading-relaxed">
                Every unit is load-tested through a full service cycle before it is graded
                and listed.{" "}
                <Link href="/conditions" className="text-white hover:text-accent transition-colors">
                  How we grade condition →
                </Link>
              </p>
            </div>
          </section>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-16 md:mt-24">
            <div className="mb-8 md:mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <Subheading text="Also On The Floor" />
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight">
                  You might also need
                </h2>
              </div>
              <Link
                href="/#catalogue"
                className="hidden md:inline-flex items-center space-x-3 text-sm font-light hover:text-accent transition-colors pb-2 border-b border-white/10 hover:border-accent"
              >
                <span>See all stock</span>
                <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {related.map((other) => (
                <EquipmentCard key={other.slug} {...other} variant="grid" />
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

function InfoCard({
  icon,
  title,
  copy,
}: {
  icon: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="bg-card rounded-[2rem] border border-border p-6">
      <div className="w-11 h-11 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mb-5">
        <iconify-icon icon={icon} width="20" height="20"></iconify-icon>
      </div>
      <h3 className="text-base font-medium tracking-tight mb-2">{title}</h3>
      <p className="text-xs font-light text-muted leading-relaxed">{copy}</p>
    </div>
  );
}
