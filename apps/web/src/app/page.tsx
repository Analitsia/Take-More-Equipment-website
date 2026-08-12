import Hero from "@/components/Hero";
import FeaturedStock from "@/components/FeaturedStock";
import Catalogue from "@/components/Catalogue";
import About from "@/components/About";
import Process from "@/components/Process";
import Testimonials from "@/components/Testimonials";
import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";
import { MAX_FEATURED } from "@takemore/core";
import { getCategoryChoices, getStock, getVocabulary } from "@/lib/stock";

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
      <Catalogue stock={stock} vocabulary={vocabulary} />
      {/* Process makes the argument once. It used to be made three times in a
          row — Process, then a "Why Take More" card grid restating the same
          price/rebuild/warranty claims, then the proof panel below in the same
          three-card shape. The middle one said nothing the other two did not,
          so it is gone and the two that carry their own weight stayed. */}
      <Process />
      <Testimonials />
      {/* About sits after the proof, not before it: the workshop story lands
          better once the reader has seen the stock, the reason it is cheap and
          the things they can check. Its "Our Process" link now points back up
          the page rather than down — still the right destination, since that is
          where the claim it makes is spelled out. */}
      <About />
      <CtaBand categories={categories} />
      <Footer />
    </div>
  );
}
