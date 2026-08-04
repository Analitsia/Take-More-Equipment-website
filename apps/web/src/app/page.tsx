import Hero from "@/components/Hero";
import FeaturedStock from "@/components/FeaturedStock";
import Shop from "@/components/Shop";
import About from "@/components/About";
import Process from "@/components/Process";
import Benefits from "@/components/Benefits";
import Testimonials from "@/components/Testimonials";
import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";

export default function Page() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Hero />
      {/* Stock leads the page — the stats and the story follow it. */}
      <FeaturedStock />
      <Shop />
      <About />
      <Process />
      <Benefits />
      <Testimonials />
      <CtaBand />
      <Footer />
    </div>
  );
}
