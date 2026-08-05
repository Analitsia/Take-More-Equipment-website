import Subheading from "./Subheading";

/**
 * PLACEHOLDER TESTIMONIALS — every quote below is invented for the mockup.
 * These must be replaced with real, attributable customer quotes before launch.
 */
export default function Testimonials() {
  const reviews = [
    {
      name: "Nadia Petersen",
      loc: "Woodstock",
      text: "We opened with a combi, a range and a double under-counter for what one new combi would have cost. Eighteen months later all three are still running six services a week.",
    },
    {
      name: "Sipho Ndlovu",
      loc: "Salt River",
      text: "They sent me photos of the replaced element before I paid a cent. No dealer has ever done that for me, new or otherwise.",
    },
    {
      name: "Marco da Silva",
      loc: "Sea Point",
      text: "Ordered on the Tuesday, delivered and levelled in my kitchen on the Thursday. No drama, no surprise costs at the door.",
    },
    {
      name: "Aisha Solomon",
      loc: "Observatory",
      text: "The thermostat went at month four. They collected it, fixed it and returned it with nothing to pay. That is the whole reason I would buy from them again.",
    },
    {
      name: "Johan Brits",
      loc: "Paarden Eiland",
      text: "I run three coffee shops. Every stainless table and under-counter fridge in all three came out of that warehouse.",
    },
    {
      name: "Thandeka Mokoena",
      loc: "Muizenberg",
      text: "Seeing the actual unit with its actual scratches before driving out there saved me two wasted trips across town.",
    },
    {
      name: "Riaan Kloppers",
      loc: "Durbanville",
      text: "Graded B, priced like a B, performs like an A. They were straight with me about the dent and knocked it off the price before I asked.",
    },
    {
      name: "Fatima Adams",
      loc: "Athlone",
      text: "I sent a photo of the gap in my line on a Saturday. By Monday they had two options with prices and dimensions in my inbox.",
    },
    {
      name: "Grant Michaels",
      loc: "Somerset West",
      text: "Fitting out a second site from new would have taken my whole budget. We did it for under half and kept cash for staff.",
    },
  ];

  return (
    <section className="py-14 md:py-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto relative overflow-hidden">
      <div className="flex flex-col items-center text-center mb-10 md:mb-16 relative z-10">
        <Subheading text="Testimonials" />
        <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight">
          Kitchens Running On
          <br />
          Take More Kit
        </h2>
      </div>

      <div className="relative h-[440px] sm:h-[520px] md:h-[600px] overflow-hidden">
        {/* Gradients for smooth scrolling effect */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none"></div>
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none"></div>

        <div className="columns-1 md:columns-2 lg:columns-3 gap-4 md:gap-6 space-y-4 md:space-y-6 pb-32">
          {reviews.map((review, idx) => (
            <div
              key={idx}
              className="bg-card rounded-[2rem] p-6 sm:p-8 border border-border break-inside-avoid shadow-lg"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-border overflow-hidden mb-5 sm:mb-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.pravatar.cc/150?u=takemore-${idx}`}
                    alt={review.name}
                    className="w-full h-full object-cover opacity-80"
                  />
                </div>
                <p className="text-xs sm:text-sm font-light text-white/80 leading-relaxed mb-5 sm:mb-6">
                  &quot;{review.text}&quot;
                </p>
                <div className="w-8 h-[1px] bg-border mb-6"></div>
                <h4 className="font-medium text-sm tracking-tight">{review.name}</h4>
                <span className="text-xs text-muted font-light mt-1">{review.loc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
