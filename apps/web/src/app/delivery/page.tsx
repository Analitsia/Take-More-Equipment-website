import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import Subheading from "@/components/Subheading";
import { site, whatsappLink } from "@/data/site";

export const metadata: Metadata = {
  title: "Delivery & Collection — Take More",
  description:
    "Collect free from Montague Gardens, book quoted Cape Town delivery within 48 hours, or ship small items nationwide by courier.",
};

const options = [
  {
    icon: "solar:shop-linear",
    title: "Collect from the warehouse",
    price: "Free",
    lead: "Same day, by appointment",
    copy: "Montague Gardens, Cape Town. Come and see the unit running before you load it — we would rather you did. Bring straps and a vehicle that fits the dimensions on the listing.",
    points: [
      "Open Mon–Fri 08:00–17:00, Sat 08:00–13:00",
      "We help load, but the vehicle is your responsibility",
      "Payment on collection by card or EFT",
    ],
  },
  {
    icon: "solar:delivery-linear",
    title: "Cape Town delivery",
    price: "Quoted by distance",
    lead: "Within 48 hours",
    copy: "Our own vehicle and two people. We place the unit where it needs to stand, level it on its feet, and take the packaging away with us.",
    points: [
      "Typically R450–R1 200 inside the metro",
      "Placed, levelled and positioned — not left on the pavement",
      "Stairs and tight access quoted separately, tell us up front",
    ],
  },
  {
    icon: "solar:box-linear",
    title: "National courier",
    price: "From R650",
    lead: "2–4 working days",
    copy: "Anything under about 30 kg ships to any major centre through our courier partner, insured for the full value. Benches, racks, small countertop equipment and accessories.",
    points: [
      "Insured to the full invoice value",
      "Tracking sent by WhatsApp on despatch",
      "Outlying areas add 1–2 days",
    ],
  },
];

const notIncluded = [
  {
    title: "Electrical connection",
    copy: "Three-phase units must be connected by a qualified electrician. Check your supply before you buy — an upgrade in an older building can cost more than the machine.",
  },
  {
    title: "Gas installation and CoC",
    copy: "Gas equipment must be installed by a registered installer who issues a Certificate of Compliance. Your insurer will ask for it, and so will the city.",
  },
  {
    title: "Water and drainage",
    copy: "Dishwashers, glasswashers and combis need a plumbed supply and a drain. We will tell you the connection sizes; a plumber does the work.",
  },
  {
    title: "Extraction",
    copy: "Canopies are made to fit a specific ceiling and duct run. We do not supply or fit them.",
  },
];

export default function DeliveryPage() {
  return (
    <PageShell
      eyebrow="Delivery & Collection"
      title={<>Getting it from our floor to yours.</>}
      intro="Three ways to take delivery, with honest lead times and what each one costs. Plus the things you will need someone else for — because a machine that arrives and cannot be connected is not much use."
      crumbs={[{ label: "Home", href: "/" }, { label: "Delivery & Collection" }]}
    >
      <ContentSection>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {options.map((option) => (
            <div
              key={option.title}
              className="bg-card rounded-[2rem] border border-border p-6 sm:p-8 flex flex-col"
            >
              <div className="w-14 h-14 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mb-8">
                <iconify-icon icon={option.icon} width="24" height="24"></iconify-icon>
              </div>

              <h3 className="text-xl font-medium tracking-tight mb-2">{option.title}</h3>
              <div className="flex items-baseline gap-3 mb-6">
                <span className="text-accent text-lg font-light tracking-tight">
                  {option.price}
                </span>
                <span className="text-xs font-light text-muted">{option.lead}</span>
              </div>

              <p className="text-muted font-light text-sm leading-relaxed mb-6">
                {option.copy}
              </p>

              <ul className="flex flex-col gap-2.5 mt-auto pt-6 border-t border-border">
                {option.points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5"></span>
                    <span className="text-xs font-light text-muted leading-relaxed">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ContentSection>

      <ContentSection>
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24">
          <div className="lg:w-1/2">
            <Subheading text="Before You Buy" />
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-6">
              Measure the door, not just the gap.
            </h2>
            <p className="text-muted font-light text-sm leading-relaxed mb-6">
              Every listing carries width, depth, height and weight in millimetres and
              kilograms. The most common problem we see is not the space the machine will
              stand in — it is the doorway, passage or stair it has to travel through to
              get there.
            </p>
            <p className="text-muted font-light text-sm leading-relaxed mb-8">
              Send us a photo of the access route and we will tell you honestly whether it
              will fit before you commit. It takes us two minutes and saves a wasted
              delivery.
            </p>
            <a
              href={whatsappLink(
                "Hi Take More, can you check whether a unit will fit through my access? I'll send photos."
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-4 group"
            >
              <span className="text-lg font-light group-hover:text-accent transition-colors">
                Send us your access photos
              </span>
              <span className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-background group-hover:scale-105 transition-transform">
                <iconify-icon icon="solar:chat-round-line-linear" width="20" height="20"></iconify-icon>
              </span>
            </a>
          </div>

          <div className="lg:w-1/2">
            <Subheading text="Not Included" />
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-8">
              What you will need someone else for
            </h2>
            <div className="flex flex-col">
              {notIncluded.map((entry) => (
                <div key={entry.title} className="py-5 border-b border-border">
                  <h3 className="text-base font-medium tracking-tight mb-2">
                    {entry.title}
                  </h3>
                  <p className="text-muted font-light text-sm leading-relaxed">
                    {entry.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ContentSection>

      <ContentSection>
        <div className="bg-card rounded-[2rem] border border-border p-6 sm:p-8 md:p-12 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-medium tracking-tight mb-3">
              Collections and viewings
            </h2>
            <p className="text-muted font-light text-sm leading-relaxed">
              {site.address} · {site.hours}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 shrink-0">
            <a
              href={`tel:${site.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-3 border border-border rounded-2xl px-6 py-4 hover:border-white/25 transition-colors"
            >
              <iconify-icon
                icon="solar:phone-linear"
                width="18"
                height="18"
                className="text-accent"
              ></iconify-icon>
              <span className="text-sm font-light">{site.phone}</span>
            </a>
            <Link
              href="/#catalogue"
              className="inline-flex items-center gap-3 bg-accent text-background rounded-2xl px-6 py-4 hover:opacity-90 transition-opacity"
            >
              <span className="text-sm font-medium">Browse stock</span>
              <iconify-icon icon="solar:arrow-right-linear" width="18" height="18"></iconify-icon>
            </Link>
          </div>
        </div>
      </ContentSection>
    </PageShell>
  );
}
