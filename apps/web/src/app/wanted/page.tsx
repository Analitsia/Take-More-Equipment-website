import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import EnquiryForm from "@/components/EnquiryForm";
import { getCategoryChoices } from "@/lib/stock";
import { site, whatsappLink } from "@/data/site";

/**
 * "Tell us what you are looking for."
 *
 * A standing page for the request the business gets constantly and could never
 * capture: somebody wants a six-burner, we do not have one this week, and
 * without a form the entire conversation happens on WhatsApp and then evaporates.
 *
 * It also gives staff something to send. "Fill this in and I'll message you when
 * one lands" is a better end to a phone call than "try us again next month".
 */

export const metadata: Metadata = {
  title: "Looking for something specific? — Take More",
  description:
    "Tell us the catering equipment you need and your budget. Most of our stock sells before it reaches the website — we will message you when yours comes through the workshop.",
};

const steps = [
  {
    icon: "solar:pen-new-square-linear",
    title: "Tell us what you need",
    copy: "The machine, roughly what you want to spend, and anything that matters — gas or electric, three-phase, how much space you have.",
  },
  {
    icon: "solar:magnifer-linear",
    title: "We watch for it",
    copy: "Every unit that comes through the workshop is checked against what people have asked for. Yours is on that list until you tell us to stop.",
  },
  {
    icon: "solar:chat-round-line-linear",
    title: "You hear first",
    copy: "Photos, the price and the condition report, before it goes on the site. Most of our stock sells at this stage.",
  },
];

export default async function WantedPage() {
  const categories = await getCategoryChoices();

  return (
    <PageShell
      eyebrow="Wanted"
      title="Most of our stock sells before it reaches this website."
      intro="Tell us what you are after and we will watch for it. No obligation, no salesperson phoning you every week — one message when the machine you described comes through the workshop."
      crumbs={[{ label: "Home", href: "/" }, { label: "Wanted" }]}
    >
      <ContentSection>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div>
            <ul className="flex flex-col gap-8">
              {steps.map((step) => (
                <li key={step.title} className="flex items-start gap-5">
                  <span className="w-11 h-11 shrink-0 rounded-2xl bg-card border border-border flex items-center justify-center text-accent">
                    <iconify-icon icon={step.icon} width="20" height="20"></iconify-icon>
                  </span>
                  <div>
                    <h2 className="text-base font-medium tracking-tight mb-1.5">{step.title}</h2>
                    <p className="text-sm font-light text-muted leading-relaxed">{step.copy}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10 pt-8 border-t border-border">
              <p className="text-sm font-light text-muted leading-relaxed">
                Would rather just talk?{" "}
                <a
                  href={whatsappLink("Hi Take More, I'm looking for the following equipment:")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:text-accent transition-colors"
                >
                  WhatsApp us
                </a>{" "}
                or call {site.phone}. We write it down at our end either way.
              </p>
            </div>
          </div>

          <EnquiryForm mode="general" categories={categories} />
        </div>
      </ContentSection>
    </PageShell>
  );
}
