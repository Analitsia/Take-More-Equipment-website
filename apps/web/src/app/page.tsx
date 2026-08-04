import Hero from "@/components/Hero";
import About from "@/components/About";
import Categories from "@/components/Categories";
import FeaturedStock from "@/components/FeaturedStock";
import Process from "@/components/Process";
import Benefits from "@/components/Benefits";
import Testimonials from "@/components/Testimonials";
import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";

export default function Page() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Hero />
      <About />
      <Categories />
      <FeaturedStock />
      <Process />
      <Benefits />
      <Testimonials />
      <CtaBand />
      <Footer />
    </div>
  );
}
