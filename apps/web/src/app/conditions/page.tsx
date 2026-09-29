import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import Subheading from "@/components/Subheading";
import { GRADES } from "@/data/equipment";

export const metadata: Metadata = {
  alternates: { canonical: "/conditions" },
  title: "Condition & Inspection — Take More",
  description:
    "What New, Like New, Good and Fair mean, and what to check when you visit the warehouse.",
};

const grades = {
  N: { headline: "New", copy: "New and unused.", examples: ["Not previously used", "Product details explain what is included"] },
  A: { headline: "Like New", copy: "Previously owned, with a near-new appearance.", examples: ["No significant visible wear", "Check the listing for details"] },
  B: { headline: "Good", copy: "Visible signs of use, clearly described and photographed.", examples: ["Surface scratches or small dents", "Condition reflected in the price"] },
  C: { headline: "Fair", copy: "Noticeable wear or cosmetic damage, clearly described and photographed.", examples: ["Visible marks or previous repairs", "Inspect the details before buying"] },
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
    copy: "A clear condition label, then photographed as-is. Scratches included.",
  },
];

export default function ConditionsPage() {
  return (
    <PageShell
      eyebrow="Condition & Inspection"
      title={<>A lower price should not mean a bigger gamble.</>}
      intro="Clear condition labels help you shortlist. Visit the warehouse to inspect your favourites and ask our team about each item."
      crumbs={[{ label: "Home", href: "/" }, { label: "Condition & Inspection" }]}
    >
      <ContentSection>
        <Subheading text="The Grades" />
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-4">
          Clear condition. No guesswork.
        </h2>
        <p className="text-muted font-light text-sm leading-relaxed max-w-2xl mb-12">
          Grades describe appearance and nothing else. Mechanical condition is not part of
          the grade, because a machine either works properly or we do not list it. Check the product details and ask our team about the tests carried out.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {GRADES.map((grade) => (
            <div
              key={grade}
              className="bg-card rounded-[2rem] border border-border p-6 sm:p-8 flex flex-col"
            >
              <h3 className="text-2xl font-medium tracking-tight mb-3">
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
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-12">
          What happens before anything is listed
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {workshop.map((step, idx) => (
            <div key={step.title} className="border-t border-border pt-8 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <span className="text-4xl sm:text-3xl font-light tracking-tighter text-white/15">
                  0{idx + 1}
                </span>
                <div className="w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center text-accent">
                  <iconify-icon icon={step.icon} width="22" height="22"></iconify-icon>
                </div>
              </div>
              <h3 className="text-2xl font-medium tracking-tight mb-3">{step.title}</h3>
              <p className="text-muted font-light text-sm leading-relaxed">{step.copy}</p>
            </div>
          ))}
        </div>
      </ContentSection>

      <ContentSection>
        <Subheading text="Before You Choose" />
        <h2 className="text-2xl md:text-4xl font-medium tracking-tight mb-4">Take a closer look.</h2>
        <p className="text-muted font-light leading-relaxed max-w-2xl mb-6">Check the condition, dimensions and features in person. For equipment, confirm that the power, gas, water and access requirements suit your space. Ask our team about the item and the work carried out.</p>
        <p className="text-xs text-muted mb-6">Your applicable statutory consumer rights are not affected.</p>
        <Link href="/about#visit" className="text-accent text-sm">Plan your visit →</Link>
      </ContentSection>
    </PageShell>
  );
}
