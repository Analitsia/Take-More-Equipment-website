import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import Subheading from "@/components/Subheading";
import { site, whatsappLink } from "@/data/site";

export const metadata: Metadata = {
  title: "About Us — Take More Catering Equipment, Cape Town",
  description:
    "We buy commercial catering equipment at auction across the Western Cape, rebuild it in our Montague Gardens workshop, and sell it at 40–60% off retail.",
};

const stats = [
  { number: "600", suffix: "+", label: "Machines Restored" },
  { number: "50", suffix: "%", label: "Average Saving vs New" },
  { number: "6", suffix: "Mo", label: "Workshop Warranty" },
  { number: "48", suffix: "H", label: "Cape Town Delivery" },
];

const principles = [
  {
    icon: "solar:gallery-wide-linear",
    title: "Photograph the flaws",
    copy: "Every unit is listed with its actual scratches and dents in frame. A buyer who drives to Montague Gardens should find exactly what they saw on the screen.",
  },
  {
    icon: "solar:tuning-2-linear",
    title: "Replace, don't polish",
    copy: "The cheap way to sell used equipment is to clean it and move it on fast. We replace the worn parts first, which is slower and is the whole point.",
  },
  {
    icon: "solar:bill-list-linear",
    title: "Put it in writing",
    copy: "Grades, workshop reports and warranty terms are published, not negotiated at the door. If we will not write it down, we will not claim it.",
  },
];

export default function AboutPage() {
  return (
    <PageShell
      eyebrow="About Us"
      title={
        <>
          We buy the kitchens that close, and rebuild them for the kitchens that are
          opening.
        </>
      }
      intro="Take More Catering Equipment is a refurbisher in Montague Gardens, Cape Town. We buy commercial kitchen equipment at auction across the Western Cape, strip and rebuild it in our own workshop, and sell each unit as the one-of-one machine it is."
      crumbs={[{ label: "Home", href: "/" }, { label: "About Us" }]}
    >
      <ContentSection>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-12 gap-x-8 pb-16 border-b border-border">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col">
              <div className="flex items-end mb-2">
                <span className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tighter">
                  {stat.number}
                </span>
                <span className="text-accent text-3xl sm:text-4xl md:text-5xl font-light tracking-tighter mb-1 ml-1">
                  {stat.suffix}
                </span>
              </div>
              <span className="text-muted font-light text-sm">{stat.label}</span>
            </div>
          ))}
        </div>
      </ContentSection>

      <ContentSection>
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24">
          <div className="lg:w-1/2">
            <Subheading text="The Business" />
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-8">
              A restaurant closes somewhere in the Cape every week.
            </h2>
            <div className="flex flex-col gap-6 text-muted font-light text-sm md:text-base leading-relaxed">
              <p>
                When it does, the kitchen goes to auction. Equipment that cost hundreds of
                thousands of rands gets sold in a morning, as-is, to whoever is in the
                room. Most of it is perfectly good. Some of it is three services from a
                failure that nobody will notice until it happens.
              </p>
              <p>
                Telling those two apart is the entire business. We are in the room, we
                know what to look at in the fifteen minutes a viewing gives you, and we
                buy on the assumption that one machine in ten will turn out to be scrap.
              </p>
              <p>
                Everything we buy goes to Montague Gardens, gets stripped, gets a parts
                list, and gets photographed before any work starts. That first set of
                photos is what lets us tell a buyer honestly what was wrong with a machine
                when it arrived and what we did about it.
              </p>
              <p>
                The result is that a kitchen opening on a real budget can buy the same
                German and Italian equipment that gets specced into new fit-outs, at
                roughly half the price, with a warranty behind it.
              </p>
            </div>
          </div>

          <div className="lg:w-1/2">
            <div className="rounded-[2rem] overflow-hidden border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1589109807644-924edf14ee09?q=80&w=1200&auto=format&fit=crop"
                alt="Stainless wash-up line in the workshop"
                className="w-full h-full object-cover aspect-[4/3]"
              />
            </div>
            <p className="text-xs font-light text-muted mt-4">
              The wash-up line, rebuilt and tested before listing.
            </p>
          </div>
        </div>
      </ContentSection>

      <ContentSection>
        <Subheading text="How We Work" />
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-12">
          Three rules we do not bend
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {principles.map((principle) => (
            <div
              key={principle.title}
              className="bg-card rounded-[2rem] p-6 sm:p-8 md:p-10 border border-border hover:border-white/10 transition-colors group"
            >
              <div className="w-14 h-14 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mb-8 group-hover:scale-110 transition-transform">
                <iconify-icon icon={principle.icon} width="24" height="24"></iconify-icon>
              </div>
              <h3 className="text-xl font-medium tracking-tight mb-4">{principle.title}</h3>
              <p className="text-muted font-light text-sm leading-relaxed">
                {principle.copy}
              </p>
            </div>
          ))}
        </div>
      </ContentSection>

      <ContentSection>
        <div className="bg-card rounded-[2rem] border border-border p-6 sm:p-8 md:p-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <Subheading text="Find Us" />
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-6">
                Come and see it running.
              </h2>
              <p className="text-muted font-light text-sm leading-relaxed">
                We would genuinely rather you drove out and watched a machine complete a
                cycle before you paid for it. Nothing on this site is sold sight-unseen if
                you would prefer not to.
              </p>
            </div>

            <div className="flex flex-col gap-5">
              <Detail icon="solar:map-point-linear" label="Warehouse" value={site.address} />
              <Detail icon="solar:clock-circle-linear" label="Hours" value={site.hours} />
              <Detail icon="solar:phone-linear" label="Phone" value={site.phone} />
              <Detail icon="solar:bill-list-linear" label="Registered" value={site.legalName} />

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <a
                  href={whatsappLink("Hi Take More, I'd like to arrange a viewing.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 bg-accent text-background rounded-2xl px-6 py-4 hover:opacity-90 transition-opacity"
                >
                  <span className="text-sm font-medium">Arrange a viewing</span>
                  <iconify-icon icon="solar:chat-round-line-linear" width="18" height="18"></iconify-icon>
                </a>
                <Link
                  href="/#catalogue"
                  className="inline-flex items-center gap-3 border border-border rounded-2xl px-6 py-4 hover:border-white/25 transition-colors"
                >
                  <span className="text-sm font-light">Browse stock</span>
                  <iconify-icon icon="solar:arrow-right-linear" width="18" height="18"></iconify-icon>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </ContentSection>
    </PageShell>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-4 pb-5 border-b border-border">
      <span className="w-9 h-9 rounded-xl bg-background border border-border flex items-center justify-center text-accent shrink-0">
        <iconify-icon icon={icon} width="16" height="16"></iconify-icon>
      </span>
      <span className="flex flex-col">
        <span className="text-xs font-light text-muted">{label}</span>
        <span className="text-sm font-light text-white/90">{value}</span>
      </span>
    </div>
  );
}
