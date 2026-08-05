/**
 * MOCKUP STOCK — hand-written stand-in data.
 *
 * The shape deliberately mirrors the `items` table in docs/architecture.md, so
 * swapping this array for a Supabase query against the `public_items` view is a
 * one-file change. Brand names are invented; nothing here is real stock.
 *
 * Gallery images are placeholders: each unit gets its own primary photo plus
 * two context shots reused across the category. Real intake photography
 * replaces `images` per unit.
 */

export const CATEGORIES = [
  "Cooking",
  "Refrigeration",
  "Preparation",
  "Wash-Up",
  "Bakery",
  "Storage",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const GRADES = ["A", "B", "C"] as const;
export type Grade = (typeof GRADES)[number];

/** Controlled vocabulary — keep this short so the filter stays scannable. */
export const TAGS = [
  "Gas",
  "Electric",
  "Countertop",
  "Under-counter",
  "Mobile",
  "Pass-through",
  "Glass door",
  "Three-phase",
  "Heavy-duty",
] as const;
export type Tag = (typeof TAGS)[number];

export type Equipment = {
  slug: string;
  title: string;
  brand: string;
  category: Category;
  /** What we're asking, in rands. */
  price: number;
  /** Comparable new price, for the saving anchor. Omit if we can't back it up. */
  retailPrice?: number;
  /** A–C, mirrors items.condition_grade */
  grade: Grade;
  capacity: string;
  power: string;
  tags: Tag[];
  /** First entry is the card image. */
  images: string[];
  description: string;
  /** What the workshop actually replaced — the proof behind the grade. */
  workshopNotes: string[];
  /** width × depth × height, in millimetres. */
  dimensionsMm: [number, number, number];
  weightKg: number;
  /** Sold units stay listed with a badge until a human unpublishes them. */
  sold?: boolean;
  /** Surfaced in the highlighted row above the catalogue. */
  featured?: boolean;
};

const img = (id: string) =>
  `https://images.unsplash.com/${id}?q=80&w=1200&auto=format&fit=crop`;

// Context shots, reused per category until real intake photography lands.
const ctx = {
  cooking: [img("photo-1627931085762-4017812f1773"), img("photo-1588416820614-f8d6ac6cea56")],
  cookingAlt: [img("photo-1511224931379-b4e4324ea7fc"), img("photo-1696475091592-cd1cab5afdc2")],
  cold: [img("photo-1784039534969-26e424548f3e"), img("photo-1708915965975-2a950db0e215")],
  prep: [img("photo-1654096276021-bd2dd59cb4ab"), img("photo-1604414499020-f9ac575bc5ec")],
  wash: [img("photo-1671656200343-d2a322492223"), img("photo-1589109807644-924edf14ee09")],
  storage: [img("photo-1749478072094-d21cb929490c"), img("photo-1604414499020-f9ac575bc5ec")],
};

export const stock: Equipment[] = [
  // --- Cooking ---
  {
    slug: "thermex-6-grid-combi-steamer",
    title: "6-Grid Combi Steamer",
    brand: "Thermex",
    category: "Cooking",
    price: 42500,
    retailPrice: 98000,
    grade: "A",
    capacity: "6 × GN 1/1",
    power: "10.2 kW",
    tags: ["Electric", "Three-phase", "Heavy-duty"],
    images: [img("photo-1707255280298-e540809f4c01"), ...ctx.cooking],
    description:
      "A six-grid electric combi rebuilt to hold a full breakfast and dinner service. Convection, steam and combination modes all hold temperature within two degrees on our test cycle, and the core probe reads true. This is the single most useful machine in a small kitchen — it roasts, steams, bakes and regenerates from one footprint.",
    workshopNotes: [
      "Door gasket and hinge springs replaced",
      "Steam generator descaled, element tested under load",
      "New drain trap and fan seal",
    ],
    dimensionsMm: [935, 780, 1010],
    weightKg: 118,
    featured: true,
  },
  {
    slug: "volterra-6-burner-range-oven",
    title: "6-Burner Range & Oven",
    brand: "Volterra",
    category: "Cooking",
    price: 18900,
    retailPrice: 41000,
    grade: "A",
    capacity: "6 burner",
    power: "34 MJ/h",
    tags: ["Gas", "Heavy-duty"],
    images: [img("flagged/photo-1570737258539-e5eef6f9b2ef"), ...ctx.cooking],
    description:
      "Six open burners over a full-width gas oven, on a heavy cast-iron frame that will outlive most of the kitchens it sits in. Every burner lights first time and holds a clean blue flame at low. The oven thermostat was recalibrated against a reference probe after we replaced it.",
    workshopNotes: [
      "All six burner heads stripped and ultrasonically cleaned",
      "Oven thermostat and thermocouple replaced",
      "New oven door seal, hinges adjusted",
    ],
    dimensionsMm: [1200, 700, 900],
    weightKg: 165,
    featured: true,
  },
  {
    slug: "ferrolux-heavy-duty-stock-pot-range",
    title: "Heavy-Duty Stock Pot Range",
    brand: "Ferrolux",
    category: "Cooking",
    price: 15750,
    retailPrice: 33000,
    grade: "B",
    capacity: "2 × 60 L",
    power: "28 MJ/h",
    tags: ["Gas", "Heavy-duty"],
    images: [img("photo-1602533438197-c9c47ae4b258"), ...ctx.cookingAlt],
    description:
      "Two low-level high-output gas rings built for 60-litre pots — stock, soup, pasta water, anything you cannot lift onto a standard range. Grade B for cosmetic reasons: the front panel carries dents and the burner grates show heat colouring. Mechanically it is sound.",
    workshopNotes: [
      "Both burner assemblies rebuilt, new jets",
      "Gas taps re-greased and pressure tested",
      "Front panel dented — priced accordingly, not repaired",
    ],
    dimensionsMm: [800, 900, 600],
    weightKg: 96,
    sold: true,
    featured: true,
  },
  {
    slug: "volterra-countertop-convection-oven",
    title: "Countertop Convection Oven",
    brand: "Volterra",
    category: "Cooking",
    price: 6400,
    retailPrice: 14500,
    grade: "B",
    capacity: "4 × 600 × 400",
    power: "3.1 kW",
    tags: ["Electric", "Countertop"],
    images: [img("photo-1583471800737-36d8e3a83ceb"), ...ctx.cookingAlt],
    description:
      "A four-tray countertop convection oven on a single-phase plug — the practical answer for a coffee shop or deli with no three-phase supply. Bakes evenly front to back once preheated. Glass has light scratching and the enamel shows its age, hence Grade B.",
    workshopNotes: [
      "Fan motor bearings replaced",
      "New door seal and internal lamp",
      "Element resistance tested, within spec",
    ],
    dimensionsMm: [800, 700, 570],
    weightKg: 48,
  },
  {
    slug: "kaldrix-4-pan-bain-marie",
    title: "4-Pan Bain-Marie",
    brand: "Kaldrix",
    category: "Cooking",
    price: 5200,
    retailPrice: 11800,
    grade: "A",
    capacity: "4 × GN 1/2",
    power: "2.4 kW",
    tags: ["Electric", "Countertop"],
    images: [img("photo-1511224931379-b4e4324ea7fc"), ...ctx.cooking],
    description:
      "A wet-well counter bain-marie holding four half-size pans at service temperature. Thermostat holds 70–85 °C without hot spots, and the well drains properly — the two things that go wrong on used units. Comes with four stainless pans and lids.",
    workshopNotes: [
      "Element and thermostat replaced",
      "Drain tap reseated, new washer",
      "Four GN 1/2 pans and lids included",
    ],
    dimensionsMm: [700, 500, 300],
    weightKg: 22,
  },

  // --- Refrigeration ---
  {
    slug: "nordika-triple-door-display-fridge",
    title: "Triple-Door Display Fridge",
    brand: "Nordika",
    category: "Refrigeration",
    price: 23900,
    retailPrice: 52000,
    grade: "A",
    capacity: "1 350 L",
    power: "0.9 kW",
    tags: ["Electric", "Glass door"],
    images: [img("photo-1762924352150-12b8c19bf4d6"), ...ctx.cold],
    description:
      "Three glass doors, LED-lit, pulling down to 2 °C in under forty minutes from ambient on our test run. Self-closing doors all seal on a paper test. The obvious front-of-house fridge for a deli, bottle store or cafe that sells cold drinks by the door.",
    workshopNotes: [
      "New compressor start relay and capacitor",
      "All three door gaskets replaced",
      "Condenser coil stripped and cleaned, gas topped and leak-tested",
    ],
    dimensionsMm: [1850, 700, 2000],
    weightKg: 245,
    featured: true,
  },
  {
    slug: "nordika-under-counter-fridge",
    title: "Under-Counter Fridge",
    brand: "Nordika",
    category: "Refrigeration",
    price: 8750,
    retailPrice: 19500,
    grade: "B",
    capacity: "280 L",
    power: "0.4 kW",
    tags: ["Electric", "Under-counter"],
    images: [img("photo-1784039534969-26e424548f3e"), ...ctx.cold],
    description:
      "A two-door stainless under-counter that slots into a standard 900 mm line. Holds 3 °C steadily with the door working. Grade B for scuffing along the left side panel, which disappears the moment it sits next to anything.",
    workshopNotes: [
      "Both door gaskets replaced",
      "Thermostat replaced, calibrated against reference",
      "New castors fitted",
    ],
    dimensionsMm: [1360, 700, 850],
    weightKg: 88,
  },

  // --- Preparation ---
  {
    slug: "kaldrix-hot-holding-cabinet",
    title: "Hot Holding Cabinet",
    brand: "Kaldrix",
    category: "Preparation",
    price: 12400,
    retailPrice: 27500,
    grade: "B",
    capacity: "10 × GN 1/1",
    power: "2.1 kW",
    tags: ["Electric", "Mobile"],
    images: [img("photo-1682071308247-04c65c28bba5"), ...ctx.prep],
    description:
      "A mobile ten-shelf holding cabinet for banqueting, functions or a busy pass. Humidity-controlled, so plated food holds without drying at the edges. Runs off a normal 15 A plug and wheels through a standard doorway.",
    workshopNotes: [
      "Heating element and fan replaced",
      "New door gasket and latch",
      "Two castors replaced, all four now lock",
    ],
    dimensionsMm: [700, 800, 1750],
    weightKg: 105,
    featured: true,
  },
  {
    slug: "brennhaus-20l-planetary-mixer",
    title: "20 L Planetary Mixer",
    brand: "Brennhaus",
    category: "Preparation",
    price: 14200,
    retailPrice: 31000,
    grade: "A",
    capacity: "20 L bowl",
    power: "1.1 kW",
    tags: ["Electric", "Countertop", "Heavy-duty"],
    images: [img("photo-1655923570951-fd93db1152e5"), ...ctx.prep],
    description:
      "A three-speed planetary with a gear-driven head that will take stiff bread dough without complaining — the failure point on belt-driven machines. Bowl, hook, paddle and whisk all included. The safety guard interlock works, which matters for an inspection.",
    workshopNotes: [
      "Gearbox drained and refilled, no metal in the old oil",
      "New drive belt and bowl-lift cable",
      "Bowl, hook, paddle and whisk included",
    ],
    dimensionsMm: [520, 600, 800],
    weightKg: 92,
  },
  {
    slug: "steelcraft-stainless-prep-counter",
    title: "Stainless Prep Counter",
    brand: "Steelcraft",
    category: "Preparation",
    price: 4300,
    retailPrice: 9800,
    grade: "A",
    capacity: "1 800 mm",
    power: "Non-electric",
    tags: ["Under-counter"],
    images: [img("photo-1604414499020-f9ac575bc5ec"), ...ctx.prep],
    description:
      "An 1 800 mm 304-stainless bench with an undershelf and adjustable feet. No dents in the top, which is unusual at this price — most second-hand benches have taken a knock somewhere. Levels properly on an uneven floor.",
    workshopNotes: [
      "Top polished, no dents or weld splits",
      "New adjustable feet",
      "Undershelf straightened",
    ],
    dimensionsMm: [1800, 700, 900],
    weightKg: 44,
  },

  // --- Wash-Up ---
  {
    slug: "aquastar-pass-through-dishwasher",
    title: "Pass-Through Dishwasher",
    brand: "Aquastar",
    category: "Wash-Up",
    price: 31500,
    retailPrice: 74000,
    grade: "A",
    capacity: "60 racks/h",
    power: "8.4 kW",
    tags: ["Electric", "Pass-through", "Three-phase"],
    images: [img("photo-1589109807644-924edf14ee09"), ...ctx.wash],
    description:
      "A hood-type pass-through running sixty racks an hour on a two-minute cycle, with a rinse boost that actually reaches 82 °C — check that figure on anything second-hand, because a machine that cannot hit it will not pass a health inspection. Wash and rinse arms are clear and spin freely.",
    workshopNotes: [
      "Wash and rinse arms stripped, all jets cleared",
      "New wash pump seal and door curtains",
      "Rinse boost element replaced, 82 °C verified",
    ],
    dimensionsMm: [740, 830, 1500],
    weightKg: 128,
    featured: true,
  },
  {
    slug: "aquastar-under-counter-glasswasher",
    title: "Under-Counter Glasswasher",
    brand: "Aquastar",
    category: "Wash-Up",
    price: 11600,
    retailPrice: 25000,
    grade: "B",
    capacity: "30 racks/h",
    power: "2.8 kW",
    tags: ["Electric", "Under-counter"],
    images: [img("photo-1776775358799-85c61b5fbb9a"), ...ctx.wash],
    description:
      "A bar glasswasher on a two-minute cycle with a built-in rinse-aid dosing pump. Single-phase, fits under a standard bar counter. Grade B: the front panel has been polished thin in one corner and the door spring is noisier than we would like.",
    workshopNotes: [
      "Drain pump replaced",
      "New door spring, rinse-aid dosing pump serviced",
      "Two glass racks included",
    ],
    dimensionsMm: [460, 530, 710],
    weightKg: 34,
    sold: true,
  },
  {
    slug: "steelcraft-double-bowl-sink",
    title: "Double Bowl Sink",
    brand: "Steelcraft",
    category: "Wash-Up",
    price: 3900,
    retailPrice: 8400,
    grade: "B",
    capacity: "2 × 500 mm",
    power: "Non-electric",
    tags: ["Under-counter"],
    images: [img("photo-1671656200343-d2a322492223"), ...ctx.wash],
    description:
      "A two-bowl pot sink with a left-hand drainer and an undershelf, deep enough to submerge a 60-litre stock pot. Taps are included and were replaced in the workshop. Grade B for surface scratching across the drainer.",
    workshopNotes: [
      "New pillar taps and swan neck",
      "Both waste kits replaced",
      "Drainer scratched — cosmetic only",
    ],
    dimensionsMm: [1600, 700, 900],
    weightKg: 52,
  },

  // --- Bakery ---
  {
    slug: "brennhaus-3-deck-bakery-oven",
    title: "3-Deck Bakery Oven",
    brand: "Brennhaus",
    category: "Bakery",
    price: 76000,
    retailPrice: 185000,
    grade: "B",
    capacity: "3 deck · 12 tray",
    power: "18 kW",
    tags: ["Electric", "Three-phase", "Heavy-duty"],
    images: [img("photo-1703607888337-aae6d77b3d83"), ...ctx.prep],
    description:
      "Three independently controlled stone decks with steam injection on each — the machine behind a proper crust. Each deck holds four 600 × 400 trays and reaches 280 °C on our test run. Grade B for cosmetics and one replaced deck light.",
    workshopNotes: [
      "Steam injection lines descaled on all three decks",
      "Two deck thermostats replaced",
      "Stone hearths intact, no cracks — checked cold and hot",
    ],
    dimensionsMm: [1300, 1100, 1800],
    weightKg: 480,
    featured: true,
  },

  // --- Storage ---
  {
    slug: "steelcraft-mobile-tray-rack",
    title: "Mobile Tray Rack",
    brand: "Steelcraft",
    category: "Storage",
    price: 3850,
    retailPrice: 8900,
    grade: "A",
    capacity: "15 tray",
    power: "Non-electric",
    tags: ["Mobile"],
    images: [img("photo-1563468304224-1fc761a1cbb5"), ...ctx.storage],
    description:
      "A fifteen-runner mobile rack sized for 600 × 400 trays, which is what most bakery and prep trays actually are. Rolls straight, brakes hold on a slope, and it fits through a 800 mm doorway. The unglamorous piece every kitchen ends up needing three of.",
    workshopNotes: [
      "All four castors replaced, two braked",
      "Frame squared and re-welded at one joint",
      "Runners straightened",
    ],
    dimensionsMm: [460, 660, 1700],
    weightKg: 28,
    featured: true,
  },
  {
    slug: "steelcraft-wall-shelf-utensil-rail",
    title: "Wall Shelf & Utensil Rail",
    brand: "Steelcraft",
    category: "Storage",
    price: 2400,
    retailPrice: 5600,
    grade: "C",
    capacity: "2 400 mm",
    power: "Non-electric",
    tags: ["Under-counter"],
    images: [img("photo-1749478072094-d21cb929490c"), ...ctx.storage],
    description:
      "A 2 400 mm stainless wall shelf with a utensil rail and eight hooks, plus brackets. Grade C and priced like it — the shelf carries dents along the front edge and one bracket has been drilled twice. Structurally fine, cosmetically honest.",
    workshopNotes: [
      "Dents along front edge — not repaired, reflected in price",
      "One bracket re-drilled by a previous owner",
      "Eight hooks and fixings included",
    ],
    dimensionsMm: [2400, 350, 400],
    weightKg: 16,
  },
];

export const featuredStock = stock.filter((item) => item.featured);

export const bySlug = (slug: string) => stock.find((item) => item.slug === slug);

/**
 * Related stock: same category first, then anything in a similar price bracket,
 * so a page always fills its row even in a thin category.
 */
export function relatedTo(item: Equipment, limit = 3): Equipment[] {
  const others = stock.filter((candidate) => candidate.slug !== item.slug);
  const sameCategory = others.filter((c) => c.category === item.category);
  const byPrice = others
    .filter((c) => c.category !== item.category)
    .sort(
      (a, b) =>
        Math.abs(a.price - item.price) - Math.abs(b.price - item.price)
    );
  return [...sameCategory, ...byPrice].slice(0, limit);
}

export const WARRANTY_MONTHS = 6;

/** Light items go on a courier; anything heavy is delivered or collected. */
export function deliveryFor(item: Equipment) {
  return item.weightKg <= 30
    ? {
        headline: "Nationwide courier",
        detail: "2–4 working days to most major centres, quoted on enquiry.",
      }
    : {
        headline: "Delivered or collected",
        detail:
          "Cape Town delivery within 48 hours, quoted by distance. Or collect free from Montague Gardens.",
      };
}

export const PRICE_BANDS = [
  { id: "under-5k", label: "Under R5 000", min: 0, max: 5000 },
  { id: "5k-15k", label: "R5 000 – R15 000", min: 5000, max: 15000 },
  { id: "15k-50k", label: "R15 000 – R50 000", min: 15000, max: 50000 },
  { id: "over-50k", label: "Over R50 000", min: 50000, max: Infinity },
] as const;
export type PriceBandId = (typeof PRICE_BANDS)[number]["id"];

/** Icon + blurb per category. Counts are derived from `stock`, never hand-typed. */
export const categoryMeta: Record<Category, { icon: string; blurb: string }> = {
  Cooking: { icon: "solar:fire-linear", blurb: "Ranges, combis, fryers, griddles" },
  Refrigeration: { icon: "solar:fridge-linear", blurb: "Under-counters, uprights, display" },
  Preparation: { icon: "solar:scissors-linear", blurb: "Mixers, slicers, prep counters" },
  "Wash-Up": { icon: "solar:washing-machine-linear", blurb: "Dishwashers, sinks, racks" },
  Bakery: { icon: "solar:chef-hat-linear", blurb: "Deck ovens, provers, dough rollers" },
  Storage: { icon: "solar:box-linear", blurb: "Tables, shelving, trolleys, rails" },
};

export const countByCategory = (category: Category) =>
  stock.filter((item) => item.category === category).length;

/** R42 500 — SA convention is a thin space, but a normal space renders safer. */
export const rands = (amount: number) =>
  `R${amount.toLocaleString("en-ZA").replace(/,/g, " ")}`;

export const mm = (value: number) => `${value.toLocaleString("en-ZA")} mm`;
