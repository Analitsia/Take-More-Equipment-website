import BrowseMore from "@/components/BrowseMore";
import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
export const metadata: Metadata = { title: "Ways to Pay — Take More", description: "Explore payment options for your in-store purchase.", alternates: { canonical: "/payment-options" } };
export default function PaymentOptions() {
  return <PageShell browse={<BrowseMore />} eyebrow="Ways to Pay" title={<>Found your next great find?</>} intro="Visit the warehouse and choose the payment option that suits your purchase. Our team will confirm the details with you." crumbs={[{label:"Home",href:"/"},{label:"Ways to Pay"}]}>
    <div className="grid md:grid-cols-2 gap-6 pb-10">{[
      ["Card or bank transfer", "Pay in full at the warehouse."],
      ["PayJustNow", "Ask about paying over time through PayJustNow. Subject to approval and provider terms."],
      ["Lay-by", "Pay over 2–3 months. Your item stays with us until it is paid in full."],
      ["7-day reservation", "A 50% deposit holds your item for seven days while you arrange the balance."],
      ["Asset financing", "Ask about financing eligible business equipment. Subject to the finance provider’s approval and terms."],
    ].map(([title,copy])=><div key={title} className="border-t border-border pt-6"><h2 className="text-xl mb-3">{title}</h2><p className="text-muted text-sm font-light">{copy}</p></div>)}</div>
    <p className="text-muted text-sm mb-6">For a seven-day reservation, if the balance is not paid within the agreed period, we return the deposit and make the item available again. Confirm cancellation and collection arrangements with our team.</p>
    <Link href="/about#visit" className="text-accent">Speak to our team →</Link>
  </PageShell>;
}
