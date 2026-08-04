/**
 * MOCKUP STOCK — hand-written stand-in data.
 *
 * The shape deliberately mirrors the `items` table in docs/architecture.md, so
 * swapping this array for a Supabase query against the `public_items` view is a
 * one-file change. Brand names are invented; nothing here is real stock.
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
  image: string;
  /** Sold units stay listed with a badge until a human unpublishes them. */
  sold?: boolean;
  /** Surfaced in the highlighted row above the catalogue. */
  featured?: boolean;
};

const img = (id: string) =>
  `https://images.unsplash.com/${id}?q=80&w=800&auto=format&fit=crop`;

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
    image: img("photo-1707255280298-e540809f4c01"),
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
    image: img("flagged/photo-1570737258539-e5eef6f9b2ef"),
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
    image: img("photo-1602533438197-c9c47ae4b258"),
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
    image: img("photo-1583471800737-36d8e3a83ceb"),
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
    image: img("photo-1511224931379-b4e4324ea7fc"),
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
    image: img("photo-1762924352150-12b8c19bf4d6"),
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
    image: img("photo-1784039534969-26e424548f3e"),
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
    image: img("photo-1682071308247-04c65c28bba5"),
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
    image: img("photo-1655923570951-fd93db1152e5"),
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
    image: img("photo-1604414499020-f9ac575bc5ec"),
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
    image: img("photo-1589109807644-924edf14ee09"),
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
    image: img("photo-1776775358799-85c61b5fbb9a"),
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
    image: img("photo-1671656200343-d2a322492223"),
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
    image: img("photo-1703607888337-aae6d77b3d83"),
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
    image: img("photo-1563468304224-1fc761a1cbb5"),
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
    image: img("photo-1749478072094-d21cb929490c"),
  },
];

export const featuredStock = stock.filter((item) => item.featured);

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
