import Link from "next/link";
import Subheading from "./Subheading";
import EnquiryForm from "./EnquiryForm";
import { site, whatsappLink } from "@/data/site";
import type { CategoryChoice } from "@/data/equipment";

/**
 * The catalogue section when there is nothing in the catalogue.
 *
 * On launch day the stock table is empty, and the ordinary <Catalogue> renders
 * "Every Unit On The Floor", a "0 of 0" counter, a filter sidebar full of
 * ticks that cannot return anything and an empty state that says "Nothing
 * matches that combination — clear the filters". Every word of that tells a
 * visitor their filters are wrong. Nothing is wrong: the stock is being listed.
 *
 * So the homepage swaps this in while `stock.length === 0`: it says what is
 * happening, and turns the visit into the one thing it can still be — an
 * enquiry. The moment the first unit is published, <Catalogue> comes back on
 * its own. Same section id, so every "/#catalogue" link on the site still
 * lands here.
 */
export default function EmptyCatalogue({
  categories,
  formEnabled,
}: {
  categories: CategoryChoice[];
  formEnabled: boolean;
}) {
  const steps = [
    {
      icon: "solar:camera-linear",
      title: "Each unit is photographed as it is",
      copy: "Scratches in frame, the workshop's parts list on the listing, a grade for looks only.",
    },
    {
      icon: "solar:tag-price-linear",
      title: "Every price goes on the page",
      copy: "Against what the same machine costs new, so you can see the real numbers before you spend anything.",
    },
    {
      icon: "solar:bell-linear",
      title: "Ask now, hear first",
      copy: "Tell us what you need and you get photos and a price before it reaches this page.",
    },
  ];

  return (
    <section
      id="catalogue"
      className="pt-12 pb-14 md:pb-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto scroll-mt-6"
    >
      <div className="relative bg-card rounded-[2rem] border border-border p-6 sm:p-8 md:p-16 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 -translate-y-1/3 translate-x-1/4 w-[min(500px,120vw)] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none"
        ></div>

        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 lg:items-start">
          <div className="max-w-2xl">
            <Subheading text="The Catalogue" />
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight leading-tight mb-6">
              New stock is being listed. Tell us what you need.
            </h2>
            <p className="text-muted font-light text-sm md:text-base leading-relaxed max-w-lg mb-8">
              The floor in Montague Gardens is not empty — this page is, for a few days,
              while each unit is tested, graded and photographed. Say what you are after
              and we will send you photos and a price the moment it is ready, before it
              goes anywhere near this page.
            </p>

            <ul className="flex flex-col gap-6 mb-10">
              {steps.map((step) => (
                <li key={step.title} className="flex items-start gap-4">
                  <span className="w-10 h-10 shrink-0 rounded-2xl bg-background border border-border flex items-center justify-center text-accent">
                    <iconify-icon icon={step.icon} width="18" height="18"></iconify-icon>
                  </span>
                  <div>
                    <h3 className="text-base font-medium tracking-tight mb-1">{step.title}</h3>
                    <p className="text-sm font-light text-muted leading-relaxed">{step.copy}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <a
                href={whatsappLink("Hi Take More, I'm looking for the following equipment:")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-4 group"
              >
                <span className="text-lg font-light group-hover:text-accent transition-colors">
                  WhatsApp Us
                </span>
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-background group-hover:scale-105 transition-transform">
                  <iconify-icon icon="solar:chat-round-line-linear" width="20" height="20"></iconify-icon>
                </div>
              </a>
              <div className="hidden sm:block w-[1px] h-8 bg-white/10"></div>
              <a
                href={`tel:${site.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center space-x-4 group"
              >
                <span className="text-lg font-light group-hover:text-accent transition-colors">
                  {site.phone}
                </span>
                <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
                  <iconify-icon icon="solar:phone-linear" width="20" height="20"></iconify-icon>
                </div>
              </a>
            </div>

            <p className="text-xs font-light text-muted leading-relaxed mt-8">
              Or come and see the floor: {site.address}, {site.hours}.{" "}
              <Link href="/delivery" className="text-white/80 hover:text-accent transition-colors">
                Directions and delivery →
              </Link>
            </p>
          </div>

          <EnquiryForm
            mode="general"
            categories={categories}
            className="bg-background"
            enabled={formEnabled}
          />
        </div>
      </div>
    </section>
  );
}
