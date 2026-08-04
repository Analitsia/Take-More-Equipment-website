/**
 * MOCKUP STOCK — hand-written stand-in data.
 *
 * The shape deliberately mirrors the `items` table in docs/architecture.md, so
 * swapping this array for a Supabase query against the `public_items` view is a
 * one-file change. Brand names are invented; nothing here is real stock.
 */
export type Equipment = {
  slug: string;
  title: string;
  brand: string;
  category: string;
  /** What we're asking, in rands. */
  price: number;
  /** Comparable new price, for the saving anchor. Omit if we can't back it up. */
  retailPrice?: number;
  /** A–C, mirrors items.condition_grade */
  grade: "A" | "B" | "C";
  capacity: string;
  power: string;
  image: string;
  /** Sold units stay listed with a badge until a human unpublishes them. */
  sold?: boolean;
};

export const featuredStock: Equipment[] = [
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
    image:
      "https://images.unsplash.com/photo-1707255280298-e540809f4c01?q=80&w=800&auto=format&fit=crop",
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
    image:
      "https://images.unsplash.com/flagged/photo-1570737258539-e5eef6f9b2ef?q=80&w=800&auto=format&fit=crop",
  },
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
    image:
      "https://images.unsplash.com/photo-1682071308247-04c65c28bba5?q=80&w=800&auto=format&fit=crop",
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
    image:
      "https://images.unsplash.com/photo-1602533438197-c9c47ae4b258?q=80&w=800&auto=format&fit=crop",
    sold: true,
  },
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
    image:
      "https://images.unsplash.com/photo-1563468304224-1fc761a1cbb5?q=80&w=800&auto=format&fit=crop",
  },
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
    image:
      "https://images.unsplash.com/photo-1703607888337-aae6d77b3d83?q=80&w=800&auto=format&fit=crop",
  },
];

export const categories = [
  { icon: "solar:fire-linear", name: "Cooking", count: 48, blurb: "Ranges, combis, fryers, griddles" },
  { icon: "solar:fridge-linear", name: "Refrigeration", count: 31, blurb: "Under-counters, uprights, blast chillers" },
  { icon: "solar:scissors-linear", name: "Preparation", count: 26, blurb: "Mixers, slicers, prep counters" },
  { icon: "solar:waterdrops-linear", name: "Wash-Up", count: 14, blurb: "Pass-through washers, sinks, racks" },
  { icon: "solar:chef-hat-linear", name: "Bakery", count: 19, blurb: "Deck ovens, provers, dough rollers" },
  { icon: "solar:box-linear", name: "Stainless & Storage", count: 52, blurb: "Tables, shelving, trolleys, sinks" },
];

/** R42 500 — SA convention is a thin space, but a normal space renders safer. */
export const rands = (amount: number) =>
  `R${amount.toLocaleString("en-ZA").replace(/,/g, " ")}`;
