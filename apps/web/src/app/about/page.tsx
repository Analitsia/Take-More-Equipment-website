import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import SiteImage from "@/components/SiteImage";
import Stats from "@/components/Stats";
import Subheading from "@/components/Subheading";
import { claims, isVerified, media } from "@/data/launch";
import { newLineCost, savingRange, site, whatsappLink } from "@/data/site";

/**
 * Two figures on this page are marketing claims rather than descriptions: how
 * far below new we price, and what a new line costs. Both are withheld until
 * verified, and the sentences around them are written twice — once with the
 * number and once without — rather than left with a gap where it should be.
 */
const saving = savingRange();
const lineCost = newLineCost();

export const metadata: Metadata = {
  title: "About Us — Take More Catering Equipment, Cape Town",
  description: saving
    ? `A commercial kitchen equipment workshop in Montague Gardens, Cape Town. We rebuild, test and warranty every machine we sell, and price it ${saving} below new.`
    : "A commercial kitchen equipment workshop in Montague Gardens, Cape Town. We rebuild, test and warranty every machine we sell, and price it well below new.",
};

const statFacts = [
  claims.machinesRebuilt,
  claims.averageSaving,
  claims.warranty,
  claims.delivery,
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
    copy: "The cheap way to sell a machine is to clean it and move it on fast. We replace the worn parts first, which costs us more and is the whole point.",
  },
  {
    icon: "solar:bill-list-linear",
    title: "Put it in writing",
    copy: "Prices, grades, workshop reports and warranty terms are published, not negotiated at the door. If we will not write it down, we will not claim it.",
  },
];

export default function AboutPage() {
  return (
    <PageShell
      eyebrow="About Us"
      title={<>The kitchen you wanted, at the number you actually budgeted.</>}
      intro={
        saving
          ? `Take More Catering Equipment is a workshop in Montague Gardens, Cape Town. We rebuild commercial kitchen equipment to a standard it will hold for years, price it ${saving} below new, and stand behind every unit in writing for six months.`
          : "Take More Catering Equipment is a workshop in Montague Gardens, Cape Town. We rebuild commercial kitchen equipment to a standard it will hold for years, price it well below new, and stand behind every unit in writing for six months."
      }
      crumbs={[{ label: "Home", href: "/" }, { label: "About Us" }]}
    >
      {/* The whole section goes, border and all, when no stat is verified — a
          lone horizontal rule under an empty block reads as a broken page. */}
      {statFacts.some(isVerified) && (
        <ContentSection>
          <div className="pb-16 border-b border-border">
            <Stats facts={statFacts} />
          </div>
        </ContentSection>
      )}

      <ContentSection>
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24">
          <div className="lg:w-1/2">
            <Subheading text="The Problem" />
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-8">
              Most kitchens are not built to the menu. They are built to the quote.
            </h2>
            <div className="flex flex-col gap-6 text-muted font-light text-sm md:text-base leading-relaxed">
              <p>
                {lineCost
                  ? `A working line for a 60-seat restaurant quotes at around ${lineCost} new, before extraction, gas certification or an electrician.`
                  : "A working line for a 60-seat restaurant quotes at a number that stops most people before they start, and that is before extraction, gas certification or an electrician."}{" "}
                So the menu gets cut to fit the machines that survived the budget, or the
                whole thing goes on finance that takes three years to clear.
              </p>
              <p>
                The usual escape is a private sale. You drive across town to a unit with no
                power connected, the seller tells you it was working when it came out, and
                the moment you load it there is nobody to call. It is cheap right up until
                a compressor goes on a Friday and takes a weekend of stock with it.
              </p>
              <p>
                We built this business to remove that choice. Every machine is stripped,
                given a parts list and photographed before any work starts. Worn parts are
                replaced, not cleaned. Then it runs a full cycle under load, gets graded
                for looks, and only then gets a price.
              </p>
              <p>
                The result is that a kitchen opening on a real budget runs the same German
                and Italian equipment that gets specced into new fit-outs, at roughly half
                the price, with six months of warranty behind it — and it is standing on
                our floor now, not eight weeks out on a ship.
              </p>
            </div>
          </div>

          <div className="lg:w-1/2">
            <div className="rounded-[2rem] overflow-hidden border border-border">
              <SiteImage
                fact={media.aboutWorkshop}
                className="w-full h-full object-cover aspect-[4/3]"
                fallbackClassName="w-full aspect-[4/3]"
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
