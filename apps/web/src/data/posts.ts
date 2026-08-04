/**
 * MOCKUP EDITORIAL — written for the MVP so the Journal has real, useful
 * content rather than lorem. The advice reflects how the business actually
 * works, but figures are illustrative and should be checked before publishing.
 */
export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "quote"; text: string };

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO
  readingMinutes: number;
  tag: string;
  image: string;
  body: Block[];
};

const img = (id: string) =>
  `https://images.unsplash.com/${id}?q=80&w=1200&auto=format&fit=crop`;

export const posts: Post[] = [
  {
    slug: "what-a-second-hand-combi-oven-should-cost",
    title: "What a second-hand combi oven should actually cost",
    excerpt:
      "Combis hold their value better than anything else in a kitchen, which is exactly why the used market is full of overpriced ones. Here is how we price them.",
    date: "2026-07-22",
    readingMinutes: 6,
    tag: "Buying guide",
    image: img("photo-1707255280298-e540809f4c01"),
    body: [
      {
        kind: "p",
        text: "A six-grid electric combi lands somewhere between R85 000 and R110 000 new in South Africa, depending on brand and whether you want a boiler or an injection steam system. That is a serious number for an independent kitchen, and it is why the second-hand market for combis is the busiest part of our floor.",
      },
      {
        kind: "p",
        text: "It is also the part where we see people overpay most often. A combi that looks clean can still be three services away from a failed steam generator, and a machine that looks tired can have had its expensive parts replaced last year. The outside tells you almost nothing.",
      },
      { kind: "h", text: "The rough bands" },
      {
        kind: "p",
        text: "For a six-grid electric unit, working, with a verified service history, we would expect to pay and to sell in these bands:",
      },
      {
        kind: "list",
        items: [
          "Under three years old, full history: 55–65% of new. Rare, and usually from a closure rather than an upgrade.",
          "Three to seven years, serviced, gaskets and probe replaced: 40–50% of new. This is where most of our stock sits.",
          "Seven years plus, working but cosmetically tired: 25–35% of new.",
          "Non-working, sold for parts or rebuild: under 15%.",
        ],
      },
      {
        kind: "p",
        text: "Our own 6-grid Thermex is listed at R42 500 against a R98 000 comparable — about 43%, which is where a properly refurbished mid-life machine should sit.",
      },
      { kind: "h", text: "The four things that actually decide the price" },
      {
        kind: "p",
        text: "Steam generator condition is first. Cape Town water is not especially hard, but a machine that has never been descaled will have a furred boiler and a shortened element life. Ask when it was last descaled and ask for proof.",
      },
      {
        kind: "p",
        text: "Door gasket and hinge are second. A gasket is a cheap part but a door that does not seal wastes energy on every cycle and will not hold steam. Push the door closed and look for light along the seal.",
      },
      {
        kind: "p",
        text: "The core probe is third. A probe that reads two degrees out is a food safety problem, not an inconvenience. It is also cheap to replace, so treat it as a negotiating point rather than a dealbreaker.",
      },
      {
        kind: "p",
        text: "Electrical supply is fourth, and it is the one that catches people out. Most six-grid combis want three-phase. If your building only has single-phase, the machine is worth nothing to you until you have paid an electrician for a supply upgrade, and in an older Cape Town building that quote can exceed the price of the oven.",
      },
      { kind: "h", text: "What we would walk away from" },
      {
        kind: "list",
        items: [
          "Any machine the seller will not run in front of you, for any reason.",
          "Visible corrosion around the base of the chamber — that is usually a drain that has been leaking for a long time.",
          "A control board with intermittent faults. Boards are the one part that can cost more than the machine is worth.",
          "No model or serial plate. Without it you cannot source parts.",
        ],
      },
      {
        kind: "quote",
        text: "If you only check one thing, run a full steam cycle from cold and watch whether it holds temperature at the end of it. Everything expensive shows up in that ten minutes.",
      },
    ],
  },
  {
    slug: "buying-at-auction-what-we-check",
    title: "Buying at auction: what we check before we bid",
    excerpt:
      "Auction lots are sold as-is, with no comeback and often no power on site. This is the fifteen-minute inspection we run on a kitchen before we put a number on it.",
    date: "2026-06-30",
    readingMinutes: 7,
    tag: "Behind the scenes",
    image: img("photo-1588416820614-f8d6ac6cea56"),
    body: [
      {
        kind: "p",
        text: "Most weeks there is a restaurant closing somewhere in the Western Cape. The equipment goes to auction, often with a viewing window of a couple of hours and no electricity connected. You bid on what you can see, and whatever you buy is yours whether it works or not.",
      },
      {
        kind: "p",
        text: "That risk is the whole reason refurbished equipment is cheap. Someone has to absorb it. Here is how we keep that from going wrong.",
      },
      { kind: "h", text: "Before the viewing" },
      {
        kind: "p",
        text: "We find out why the kitchen closed. A lease ending or an owner retiring usually means well-kept equipment. A liquidation after a long decline usually means deferred maintenance on everything, because the last thing a struggling kitchen spends money on is a service contract.",
      },
      {
        kind: "p",
        text: "We also check what the building had. A site with three-phase and good extraction tends to have equipment that was installed properly and run within spec.",
      },
      { kind: "h", text: "The fifteen-minute walk" },
      {
        kind: "list",
        items: [
          "Model and serial plates on everything. No plate, no bid — parts availability is the whole game on used equipment.",
          "Open every door and look at the gaskets. Perished seals across a whole kitchen tell you nobody was servicing anything.",
          "Look underneath. Corrosion at the feet means standing water, which means the floor drainage was bad and everything low down has suffered.",
          "Pull the condenser cover on refrigeration. A coil packed solid with grease means the compressor has been working hard for years.",
          "Check burner grates and heat colouring on gas equipment. Even bluing is fine; warped or cracked cast iron is not.",
          "Smell the inside of the fridges. Mould in the insulation is not something you clean out.",
        ],
      },
      { kind: "h", text: "What we pay" },
      {
        kind: "p",
        text: "We work backwards from what the unit will list for after refurbishment, subtract the parts and workshop hours we expect it to need, subtract transport, and leave enough margin to absorb the one machine in ten that turns out to be scrap. If the bidding passes that number we stop. This sounds obvious and it is the single hardest discipline in the business.",
      },
      {
        kind: "quote",
        text: "The lots that look like bargains in the room are usually the ones nobody else wanted for a reason they could see and you could not.",
      },
      { kind: "h", text: "What happens next" },
      {
        kind: "p",
        text: "Everything goes straight to Montague Gardens, gets stripped, gets a parts list, and gets photographed before any work starts. That first set of photos is what lets us tell a buyer honestly what was wrong with a machine when it arrived and what we did about it.",
      },
    ],
  },
  {
    slug: "grade-a-b-c-what-the-letters-mean",
    title: "Grade A, B or C — what the letters actually mean",
    excerpt:
      "Condition grades are meaningless unless the seller publishes the rules. Here are ours, including exactly what will and will not get a unit downgraded.",
    date: "2026-06-11",
    readingMinutes: 4,
    tag: "How we work",
    image: img("photo-1696475091592-cd1cab5afdc2"),
    body: [
      {
        kind: "p",
        text: "Every dealer in used catering equipment grades their stock, and almost none of them will tell you what the grades mean. That is convenient for the dealer and useless for you.",
      },
      {
        kind: "p",
        text: "Ours are deliberately simple, and they describe cosmetic condition only. Mechanical condition is not part of the grade, because nothing leaves our workshop mechanically compromised — a machine either works properly or we do not list it.",
      },
      { kind: "h", text: "Grade A" },
      {
        kind: "p",
        text: "Presentable front of house. Light surface marks visible up close, nothing you would notice from two metres. Doors, panels and handles all straight. This is what you buy if the unit will be in view of customers.",
      },
      { kind: "h", text: "Grade B" },
      {
        kind: "p",
        text: "Honest working condition. Scratches, scuffs, heat discolouration, or a dent in a panel that does not affect function. Perfectly good behind a pass where nobody sees it, and typically 15–25% cheaper than the equivalent Grade A.",
      },
      { kind: "h", text: "Grade C" },
      {
        kind: "p",
        text: "Cosmetically rough and priced accordingly. Dents along an edge, mismatched panels, previous owner's drill holes. Works exactly as it should. We photograph every flaw and list it in the workshop report, so nothing is a surprise on delivery.",
      },
      { kind: "h", text: "What never affects the grade" },
      {
        kind: "list",
        items: [
          "Anything mechanical. Worn parts get replaced before listing, whatever the grade.",
          "Missing accessories. If pans, racks or shelves are missing we say so in the listing and adjust the price.",
          "Age on its own. A well-kept ten-year-old machine can be Grade A.",
        ],
      },
      {
        kind: "p",
        text: "All three grades carry the same six-month parts-and-labour warranty. A cheaper grade buys you a more marked panel, not a shorter guarantee.",
      },
    ],
  },
  {
    slug: "fitting-out-a-60-seat-kitchen",
    title: "Fitting out a 60-seat kitchen for under R250 000",
    excerpt:
      "A worked example: what a mid-size restaurant kitchen actually needs, what it costs new, and what the same line costs refurbished.",
    date: "2026-05-19",
    readingMinutes: 8,
    tag: "Buying guide",
    image: img("photo-1708915965975-2a950db0e215"),
    body: [
      {
        kind: "p",
        text: "A 60-seat à la carte restaurant turning two covers a night needs less equipment than most first-time owners think, and better equipment than most budgets allow for. Refurbished is how you resolve that.",
      },
      {
        kind: "p",
        text: "Here is a realistic line, priced both ways. New prices are mid-market South African retail as at mid-2026; refurbished prices are what comparable units have listed for on our floor.",
      },
      { kind: "h", text: "The cooking line" },
      {
        kind: "list",
        items: [
          "Six-burner range with oven — R41 000 new / R18 900 refurbished",
          "Six-grid combi steamer — R98 000 new / R42 500 refurbished",
          "Twin-basket fryer — R22 000 new / R9 500 refurbished",
          "900 mm chargrill — R34 000 new / R14 000 refurbished",
          "Extraction canopy — quoted per site, rarely worth buying used",
        ],
      },
      { kind: "h", text: "Cold" },
      {
        kind: "list",
        items: [
          "Two-door under-counter fridge — R19 500 new / R8 750 refurbished",
          "Upright freezer — R28 000 new / R12 000 refurbished",
          "Prep fridge with saladette top — R31 000 new / R14 500 refurbished",
        ],
      },
      { kind: "h", text: "Wash-up and stainless" },
      {
        kind: "list",
        items: [
          "Pass-through dishwasher — R74 000 new / R31 500 refurbished",
          "Double bowl pot sink — R8 400 new / R3 900 refurbished",
          "Three prep benches and shelving — R26 000 new / R11 000 refurbished",
        ],
      },
      { kind: "h", text: "The totals" },
      {
        kind: "p",
        text: "New, that line comes to roughly R381 900 before extraction, installation or gas certification. Refurbished, the same line is about R166 550 — a saving of R215 350, or 56%.",
      },
      {
        kind: "p",
        text: "That leaves room inside a R250 000 budget for the things you genuinely should not buy used: extraction, gas installation with a certificate of compliance, and an electrician to sign off the supply.",
      },
      { kind: "h", text: "Where we would still buy new" },
      {
        kind: "p",
        text: "Extraction canopies, because they are made to fit your specific ceiling and duct run. Anything with a compressor that you intend to run twenty-four hours a day for ten years, if cash allows. And small wares — pans, knives, containers — where the second-hand saving is not worth the hassle.",
      },
      {
        kind: "quote",
        text: "The point of buying refurbished is not to spend less. It is to spend the same money on a better kitchen than your budget could otherwise reach.",
      },
    ],
  },
];

export const postBySlug = (slug: string) => posts.find((post) => post.slug === slug);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
