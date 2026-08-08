import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import { processors, published } from "@/data/launch";
import { site } from "@/data/site";

/**
 * The privacy notice.
 *
 * Not decoration and not optional: POPIA s18 requires that a person be told what
 * is being collected and why AT THE POINT OF COLLECTION, which is why every
 * enquiry form on this site links here. Written in the same voice as the rest of
 * the site, because a notice nobody reads protects nobody.
 *
 * The registered particulars — company registration number and the appointed
 * Information Officer — come from `launch.ts` and are blocking facts: a
 * production build fails while either is unfilled, because s18 requires a data
 * subject be told who is responsible for their information and "nobody yet" is
 * not an answer.
 *
 * The sub-processor list is also generated from `launch.ts` rather than typed
 * out here. That is deliberate. Adding a vendor anywhere in this codebase means
 * adding it to the manifest, which mechanically changes this page — so the
 * notice cannot quietly fall out of date the way it did when error monitoring
 * was introduced and the sentence still read "Supabase and Resend".
 */

/** "A, B and C" — an Oxford-comma-free list, because this is prose. */
const sentenceList = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export const metadata: Metadata = {
  title: "Privacy — Take More",
  description:
    "What Take More Catering Equipment collects when you enquire, why we keep it, who sees it, and how to have it deleted.",
};

type Section = { heading: string; body: string[]; list?: string[] };

const sections: Section[] = [
  {
    heading: "What we keep, and why",
    body: [
      "When you fill in a form on this site, or when you tell one of our staff at the counter or on WhatsApp, we write down what you are looking for so we can actually help you.",
    ],
    list: [
      "Your email address — so we can reply, and so we can tell you when the machine you wanted comes in.",
      "Your name and phone number, if you gave them — so the person serving you knows who you are, and so we can WhatsApp you rather than making you wait for an email.",
      "What you are looking for, in your own words, plus the machine you were looking at when you asked.",
      "Your birthday, if you told us — some of our customers get a note on it. Nothing else uses it.",
      "Notes from conversations we have had with you, so you do not have to explain your kitchen twice.",
    ],
  },
  {
    heading: "Why we are allowed to have it",
    body: [
      "For marketing, we rely on your consent: the tick box on the form, or you telling a staff member you would like to hear about new stock. Nothing is pre-ticked, and agreeing to email does not agree you to WhatsApp — they are separate.",
      "If you have bought from us, we may also send you news about similar equipment under the existing-customer provision in section 69 of POPIA. Every one of those messages carries the same one-click opt-out as everything else.",
      "We do not buy lists, we do not scrape addresses, and we do not send you anything about products that have nothing to do with catering equipment.",
    ],
  },
  {
    heading: "Who can see it",
    body: [
      "Our own staff, and only through our internal system, which requires an account that the owner has personally approved. It is not a shared spreadsheet and it is not on anybody's phone.",
      `We use a handful of suppliers to run this: ${sentenceList(
        published(processors).map((p) => `${p.name} ${p.purpose}`)
      )}. Each processes this data on our behalf and none of them may use it for anything else.`,
      "We do not sell your details. We do not share them with other equipment dealers. There is no third case.",
    ],
  },
  {
    heading: "Stopping the messages",
    body: [
      "Every marketing email has an unsubscribe link that works in one click, with no login and no questions. It takes effect immediately.",
      `You can also reply to any message, WhatsApp us on ${site.phone}, or say so in the yard. All three reach the same place.`,
      "Stopping the marketing does not affect a purchase you are in the middle of — we will still talk to you about that.",
    ],
  },
  {
    heading: "Seeing it, correcting it, deleting it",
    body: [
      `Write to ${site.email} and ask. You can ask us what we hold about you, ask us to fix something that is wrong, and ask us to delete it.`,
      "When we delete, we remove your name and contact details for good. We keep the fact that a sale happened, without you attached to it, because we are required to keep our own accounting records.",
      "If you are not happy with how we have handled it, you can complain to the Information Regulator of South Africa at inforeg@justice.gov.za.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "For as long as you might still want a machine from us, and no longer. If we have not heard from you in three years and you have never bought anything, we clear your details out.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Your Details"
      title="What we do with what you tell us."
      intro="Plain version: we keep your email and what you are looking for, so we can tell you when we get one. You can stop it in one click, any time, and we never pass your details on."
      crumbs={[{ label: "Home", href: "/" }, { label: "Privacy" }]}
    >
      <ContentSection>
        <div className="flex flex-col gap-12 max-w-2xl">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-medium tracking-tight mb-5">
                {section.heading}
              </h2>
              <div className="flex flex-col gap-4">
                {section.body.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-muted font-light text-sm md:text-base leading-relaxed"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
              {section.list && (
                <ul className="flex flex-col gap-3 mt-5">
                  {section.list.map((point) => (
                    <li key={point} className="flex items-start gap-4">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-2.5" />
                      <span className="text-muted font-light text-sm md:text-base leading-relaxed">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Who is responsible, named. POPIA s18(1)(a) requires the responsible
              party be identified to the data subject, and the Information
              Regulator expects a specific person rather than a department. */}
          <section>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-medium tracking-tight mb-5">
              Who is responsible for this
            </h2>
            <dl className="flex flex-col gap-3 max-w-md">
              <Particular label="Responsible party" value={site.legalName} />
              <Particular label="Registration number" value={site.registrationNumber} />
              <Particular label="Information Officer" value={site.informationOfficer} />
              <Particular label="Address" value={site.address} />
              <Particular label="Email" value={site.email} href={`mailto:${site.email}`} />
              <Particular label="Phone" value={site.phone} />
            </dl>
          </section>

          <div className="pt-8 border-t border-border">
            <p className="text-xs font-light text-muted leading-relaxed">
              Last updated {new Date().getFullYear()}. If we change how any of
              this works, this page changes with it before the change goes live.
            </p>
          </div>
        </div>
      </ContentSection>
    </PageShell>
  );
}

function Particular({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 pb-3 border-b border-border">
      <dt className="text-xs font-light text-muted sm:w-44 shrink-0">{label}</dt>
      <dd className="text-sm font-light text-white/90">
        {href ? (
          <a href={href} className="hover:text-accent transition-colors">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
