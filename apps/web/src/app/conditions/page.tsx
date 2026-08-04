import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import Subheading from "@/components/Subheading";
import { GRADES, WARRANTY_MONTHS, countByCategory } from "@/data/equipment";

export const metadata: Metadata = {
  title: "Condition & Warranty — Take More",
  description:
    "What Grade A, B and C mean, what we replace before a unit is listed, and the terms of the six-month parts-and-labour warranty.",
};

const grades: Record<
  (typeof GRADES)[number],
  { headline: string; copy: string; examples: string[] }
> = {
  A: {
    headline: "Presentable front of house",
    copy: "Light surface marks visible up close, nothing you would notice from two metres. Doors, panels and handles straight and aligned.",
    examples: [
      "Fine scratching on stainless, no dents",
      "All original panels and handles",
      "Buy this if customers will see it",
    ],
  },
  B: {
    headline: "Honest working condition",
    copy: "Scratches, scuffs, heat discolouration or a dent that does not affect function. Typically 15–25% cheaper than the equivalent Grade A unit.",
    examples: [
      "Dented panel or marked drainer",
      "Heat colouring on grates and trims",
      "Buy this if it lives behind the pass",
    ],
  },
  C: {
    headline: "Cosmetically rough, priced for it",
    copy: "Dents along an edge, mismatched panels, a previous owner's drill holes. Works exactly as it should, and every flaw is photographed and listed.",
    examples: [
      "Visible dents or previous repairs",
      "Mismatched or re-drilled fittings",
      "Buy this if only function matters",
    ],
  },
};

const workshop = [
  {
    icon: "solar:magnifer-zoom-in-linear",
    title: "Strip and assess",
    copy: "Every unit is photographed on arrival before any work starts, then stripped far enough to see what has actually been running.",
  },
  {
    icon: "solar:settings-linear",
    title: "Replace what is worn",
    copy: "Gaskets, elements, thermostats, bearings, castors, seals and probes. Not cleaned and resold — replaced.",
  },
  {
    icon: "solar:checklist-minimalistic-linear",
    title: "Test under load",
    copy: "A full service cycle at working temperature, with rinse and core temperatures verified against a reference instrument.",
  },
  {
    icon: "solar:gallery-wide-linear",
    title: "Grade and photograph",
    copy: "An honest A, B or C for cosmetics only, then photographed as-is. Scratches included.",
  },
];

export default function ConditionsPage() {
  return (
    <PageShell
      eyebrow="Condition & Warranty"
      title={<>Used should never mean unknown.</>}
      intro="Most dealers grade their stock and never publish the rules. Ours are below, along with exactly what we replace before anything is listed and what the warranty actually covers."
      crumbs={[{ label: "Home", href: "/" }, { label: "Condition & Warranty" }]}
    >
      <ContentSection>
        <Subheading text="The Grades" />
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-4">
          Three letters, cosmetics only
        </h2>
        <p className="text-muted font-light text-sm leading-relaxed max-w-2xl mb-12">
          Grades describe appearance and nothing else. Mechanical condition is not part of
          the grade, because a machine either works properly or we do not list it. All
          three grades carry the same warranty.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {GRADES.map((grade) => (
            <div
              key={grade}
              className="bg-card rounded-[2rem] border border-border p-8 flex flex-col"
            >
              <div className="flex items-baseline gap-3 mb-6">
                <span className="text-5xl font-light tracking-tighter">{grade}</span>
                <span className="text-accent text-sm font-light">Grade</span>
              </div>
              <h3 className="text-lg font-medium tracking-tight mb-3">
                {grades[grade].headline}
              </h3>
              <p className="text-muted font-light text-sm leading-relaxed mb-6">
                {grades[grade].copy}
              </p>
              <ul className="flex flex-col gap-2.5 mt-auto pt-6 border-t border-border">
                {grades[grade].examples.map((example) => (
                  <li key={example} className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5"></span>
                    <span className="text-xs font-light text-muted leading-relaxed">
                      {example}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ContentSection>

      <ContentSection>
        <Subheading text="The Workshop" />
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-12">
          What happens before anything is listed
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {workshop.map((step, idx) => (
            <div key={step.title} className="border-t border-border pt-8 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <span className="text-5xl font-light tracking-tighter text-white/15">
                  0{idx + 1}
                </span>
                <div className="w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center text-accent">
                  <iconify-icon icon={step.icon} width="22" height="22"></iconify-icon>
                </div>
              </div>
              <h3 className="text-lg font-medium tracking-tight mb-3">{step.title}</h3>
              <p className="text-muted font-light text-sm leading-relaxed">{step.copy}</p>
            </div>
          ))}
        </div>
      </ContentSection>

      <ContentSection>
        <div className="bg-card rounded-[2rem] border border-border p-8 md:p-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24">
            <div>
              <Subheading text="The Warranty" />
              <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-6">
                {WARRANTY_MONTHS} months, parts and labour, in writing.
              </h2>
              <p className="text-muted font-light text-sm leading-relaxed">
                If a unit fails within {WARRANTY_MONTHS} months of collection or delivery,
                we collect it, repair it and return it at our cost. You get the warranty
                document with your invoice — not a verbal promise at the door.
              </p>
            </div>

            <div className="flex flex-col gap-8">
              <div>
                <h3 className="text-sm font-medium tracking-tight mb-4 flex items-center gap-3">
                  <iconify-icon
                    icon="solar:check-read-linear"
                    width="16"
                    height="16"
                    className="text-accent"
                  ></iconify-icon>
                  Covered
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {[
                    "Mechanical and electrical failure under normal commercial use",
                    "Parts we replaced in the workshop",
                    "Compressors, elements, thermostats, pumps and motors",
                    "Collection and return transport within the Cape Town metro",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5"></span>
                      <span className="text-xs font-light text-muted leading-relaxed">
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-medium tracking-tight mb-4 flex items-center gap-3">
                  <iconify-icon
                    icon="solar:close-circle-linear"
                    width="16"
                    height="16"
                    className="text-muted"
                  ></iconify-icon>
                  Not covered
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {[
                    "Cosmetic condition disclosed at the time of sale",
                    "Damage from incorrect installation, supply or gas pressure",
                    "Consumables — lamps, filters, rinse aid, fuses",
                    "Scale damage where no water treatment was fitted",
                    "Units modified or repaired by a third party",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0 mt-1.5"></span>
                      <span className="text-xs font-light text-muted leading-relaxed">
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <p className="text-xs font-light text-muted max-w-lg">
              Consumer Protection Act rights are not affected. Cooling-off and return
              rights for distance sales apply in addition to this warranty.
            </p>
            <Link href="/#catalogue" className="inline-flex items-center gap-4 group shrink-0">
              <span className="text-sm font-light group-hover:text-accent transition-colors">
                Browse {countByCategory("Cooking") > 0 ? "the catalogue" : "stock"}
              </span>
              <span className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-background group-hover:scale-105 transition-transform">
                <iconify-icon icon="solar:arrow-right-linear" width="18" height="18"></iconify-icon>
              </span>
            </Link>
          </div>
        </div>
      </ContentSection>
    </PageShell>
  );
}
