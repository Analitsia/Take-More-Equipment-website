import type { Metadata } from "next";
import HomeStorefront from "@/components/HomeStorefront";
import About from "@/components/About";
import Process from "@/components/Process";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import { getCategoryChoices, getStock, getVocabulary } from "@/lib/stock";
import { enquiryFormEnabled } from "@/lib/forms";

/** Title and description come from the root layout; this only pins the canonical. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Page() {
  // Fetched once here and handed down, rather than each section reaching for
  // the database on its own — the catalogue, the highlights row and the filter
  // counts are three views of the same list and must agree.
  const stock = await getStock();
  const vocabulary = await getVocabulary(stock);
  // Slugs rather than the display names above: the enquiry form sends these
  // straight through to capture_lead(), which resolves them into a real
  // category so the stock matcher has something to join on.
  const categories = await getCategoryChoices();
  const formEnabled = enquiryFormEnabled();

  return <HomeStorefront stock={stock} vocabulary={vocabulary} categories={categories} formEnabled={formEnabled}
    process={<Process />} proof={<Testimonials />} about={<About />} footer={<Footer />} />;
}
