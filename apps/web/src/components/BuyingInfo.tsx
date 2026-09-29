import Link from "next/link";
import { DELIVERY_RULE_LABEL } from "@takemore/core";
import { site } from "@/data/site";
import Subheading from "./Subheading";
export default function BuyingInfo() {
  return <section className="px-6 md:px-12 py-14 md:py-20 max-w-[1440px] w-full mx-auto">
    <Subheading text="Better In Person" />
    <h2 className="text-3xl md:text-5xl tracking-tight mb-5">Come see what you find.</h2>
    <p className="text-muted font-light max-w-2xl mb-8">The catalogue is just the start. Explore the warehouse, inspect your favourites and talk to our team before you buy.</p>
    <div className="grid md:grid-cols-3 gap-6">
      <div className="border-t border-border pt-6"><h3 className="text-xl mb-3">Visit the warehouse</h3><p className="text-sm text-muted mb-4">{site.address}</p><Link href="/about#visit" className="text-accent text-sm">Directions &amp; opening hours →</Link></div>
      <div className="border-t border-border pt-6"><h3 className="text-xl mb-3">Collect or arrange delivery</h3><p className="text-sm text-muted mb-4">Collect from us, or ask for delivery. {DELIVERY_RULE_LABEL}.</p><Link href="/delivery" className="text-accent text-sm">Delivery &amp; collection →</Link></div>
      <div className="border-t border-border pt-6"><h3 className="text-xl mb-3">Ways to pay</h3><p className="text-sm text-muted mb-4">Card · Bank transfer · PayJustNow · Lay-by · 7-day reservation · Asset financing</p><p className="text-xs text-muted mb-4">Ask our team about the right option for your purchase. Approval and terms apply.</p><Link href="/payment-options" className="text-accent text-sm">See the options →</Link></div>
    </div>
  </section>;
}
