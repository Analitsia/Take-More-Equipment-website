import Hero from "@/components/Hero";
import FeaturedStock from "@/components/FeaturedStock";
import Shop from "@/components/Shop";
import About from "@/components/About";
import Process from "@/components/Process";
import Benefits from "@/components/Benefits";
import Testimonials from "@/components/Testimonials";
import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";
import { MAX_FEATURED } from "@takemore/core";
import { getCategoryChoices, getStock, getVocabulary } from "@/lib/stock";

export default async function Page() {
  // Fetched once here and handed down, rather than each section reaching for
  // the database on its own — the catalogue, the highlights row and the
  // category counts are three views of the same list and must agree.
  const stock = await getStock();
  const vocabulary = await getVocabulary(stock);
  // Slugs rather than the display names above: the enquiry form sends these
  // straight through to capture_lead(), which resolves them into a real
  // category so the stock matcher has something to join on.
  const categories = await getCategoryChoices();
  // Capped here as well as in the database. The trigger stops a worker choosing
  // a ninth; this stops anything that arrived around the trigger — a seeded row,
  // a repair run in the SQL editor — from turning the highlights row back into
  // the catalogue. `getStock` already sorts featured first, then newest.
  const featured = stock.filter((item) => item.featured).slice(0, MAX_FEATURED);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Hero />
      {/* Stock leads the page — the stats and the story follow it. */}
      {featured.length > 0 && <FeaturedStock items={featured} />}
      <Shop stock={stock} vocabulary={vocabulary} />
      <About />
      <Process />
      <Benefits />
      <Testimonials />
      <CtaBand categories={categories} />
      <Footer />
    </div>
  );
}
