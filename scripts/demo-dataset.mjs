/**
 * The demo catalogue: fifteen machines and fifteen people.
 *
 * ── What this is for ──────────────────────────────────────────────────────
 *
 * Nothing here is real. It exists so the storefront and the ops app can be
 * looked at with a plausible amount of stock and a plausible CRM behind them,
 * before either has real data in it. Seed it with `npm run demo:seed`, take it
 * away again with `npm run demo:clear`.
 *
 * ── The one honest caveat, stated where it cannot be missed ───────────────
 *
 * 20260809090000_no_placeholders_on_published.sql guarantees that a published
 * item carries a photograph OF THE ACTUAL MACHINE: a placeholder is an
 * external_url with is_placeholder set, and the publish gate counts only rows
 * with a storage_path. There is no way to put a demo item on the public site
 * without satisfying that gate, and no way to satisfy it with a flagged
 * placeholder.
 *
 * So these photographs go in as real Storage objects. They are stock
 * photography of catering equipment, not photographs of fifteen machines that
 * exist. The schema's guarantee is technically intact — every published row has
 * a real object behind it — and its INTENT is suspended for as long as this seed
 * is loaded. That is the trade Carlo asked for when he asked to see the thing
 * populated, and it is reversible in one command. It is written down here rather
 * than discovered later.
 *
 * Every row this file describes carries a marker — `items.specs.demo_seed` and
 * `leads.extra.demo_seed` — which is what demo-clear.mjs deletes on. Neither
 * column is rendered by either app, so the marker is invisible in the UI and
 * unambiguous in SQL. The fixed UUIDs below are the second belt: re-seeding
 * updates the same rows rather than minting a second set.
 *
 * ── Deliberate incompleteness ─────────────────────────────────────────────
 *
 * Real intake is patchy. A machine arrives with no badge, or the scale is
 * broken that week, or nobody knows the comparable new price. Roughly a third
 * of the fields below are null on purpose so both apps can be judged on how
 * they render a half-filled row, which is the row they will mostly get.
 *
 * ── Stages, and which of them are on the website ──────────────────────────
 *
 * 20260808120000_four_stages.sql retired `intake`, `ready` and `handed_over`.
 * Four stages remain, and the stage decides publication rather than a second
 * switch a human has to remember — `listed` and `refurbishing` are live,
 * `reserved` and `sold` are not. `published` below therefore always agrees with
 * setStage() in apps/ops, with one deliberate exception: two machines are in
 * the workshop with no price and no description, so the publish gate refuses
 * them. That is not a bug in the seed. It is what the ops app does when a
 * worker taps a live stage on a half-filled row, and it is worth seeing.
 */

export const DEMO_MARKER = "demo_seed";
export const DEMO_STAMP = "2026-08-12";

/** Fixed so a re-seed updates rather than duplicates. All hex, all obvious. */
const item = (n) => `dec0de00-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lead = (n) => `1eadbeef-0000-4000-8000-${String(n).padStart(12, "0")}`;

const R = (rands) => rands * 100; // rands → cents, the unit everything stores

/**
 * Source photography, by short key. Downloaded once into .demo-media/ and
 * reused; the keys are what the items below refer to.
 *
 * These are the same Unsplash shots the pre-database mock catalogue used, which
 * is why they line up with the machine types — they were picked for exactly
 * this catalogue by an earlier session.
 */
export const PHOTOS = {
  combiOven: "photo-1707255280298-e540809f4c01",
  gasRange: "flagged/photo-1570737258539-e5eef6f9b2ef",
  stockPots: "photo-1602533438197-c9c47ae4b258",
  ovenKnobs: "photo-1583471800737-36d8e3a83ceb",
  vintageOven: "photo-1696475091592-cd1cab5afdc2",
  holdingTrays: "photo-1682071308247-04c65c28bba5",
  displayFridge: "photo-1762924352150-12b8c19bf4d6",
  underCounterFridge: "photo-1784039534969-26e424548f3e",
  bakeryMixer: "photo-1655923570951-fd93db1152e5",
  prepBench: "photo-1604414499020-f9ac575bc5ec",
  dishwasher: "photo-1589109807644-924edf14ee09",
  glassRacks: "photo-1776775358799-85c61b5fbb9a",
  doubleSink: "photo-1671656200343-d2a322492223",
  deckOven: "photo-1703607888337-aae6d77b3d83",
  trayRack: "photo-1563468304224-1fc761a1cbb5",
  wallShelf: "photo-1749478072094-d21cb929490c",
  // Context — a second angle on the room rather than on the machine.
  kitchenPot: "photo-1627931085762-4017812f1773",
  kitchenSteam: "photo-1588416820614-f8d6ac6cea56",
  kitchenCounter: "photo-1708915965975-2a950db0e215",
  copperPots: "photo-1511224931379-b4e4324ea7fc",
  machinePart: "photo-1654096276021-bd2dd59cb4ab",
};

/**
 * Fifteen machines.
 *
 * `media` is a recipe, not a list of files: `photo` entries name a key from
 * PHOTOS above and an optional crop (a detail shot cut out of the same
 * original, so a second frame is genuinely different from the first), and
 * `video` entries name the stills a clip is built from. demo-media.mjs turns
 * the recipe into files; demo-seed.mjs uploads them.
 *
 * Crops are [x, y, w, h] as fractions of the original.
 */
export const ITEMS = [
  {
    id: item(1),
    title: "6-Grid Combi Steamer",
    brand: "Thermex",
    model: "CS-611E",
    category: "cooking",
    subcategory: "cooking-ovens-combis",
    grade: "A",
    description:
      "A six-grid electric combi that came out of a Sea Point hotel kitchen when they went to a ten-grid. Steam, convection and combination modes all tested under load, core probe reading true across the range, and the boiler descaled and pressure-checked. Door seal and both hinges are new. It is a serious piece of kit for a kitchen doing covers rather than plating for twenty.",
    workshopNotes: [
      "New door gasket and both hinge cartridges",
      "Boiler descaled, element resistance checked under load",
      "Core probe recalibrated against a reference thermometer",
      "Fan motor bearings replaced",
    ],
    capacity: "6 × GN 1/1",
    power: "10.2 kW · 400 V 3-phase",
    dims: [935, 780, 1010],
    weight: 118,
    list: R(42500),
    retail: R(98000),
    tags: ["electric", "three-phase", "heavy-duty"],
    status: "listed",
    published: true,
    featured: true,
    arrived: "2026-06-18",
    costs: [
      { kind: "auction", amount: R(14200), note: "Aucor, Epping — lot 218" },
      { kind: "buyers_premium", amount: R(2130) },
      { kind: "transport", amount: R(1450), note: "Tail-lift from Epping" },
      { kind: "parts", amount: R(3890), note: "Gasket set, hinge cartridges, fan bearings" },
      { kind: "labour", amount: R(2600), hours: 13 },
    ],
    media: [
      { kind: "photo", src: "combiOven" },
      { kind: "photo", src: "combiOven", crop: [0.08, 0.1, 0.44, 0.55], label: "controls" },
      { kind: "photo", src: "kitchenSteam" },
      { kind: "video", frames: ["combiOven", "kitchenSteam"], label: "walkaround" },
      { kind: "video", frames: ["combiOven"], crop: [0.05, 0.05, 0.6, 0.7], label: "running" },
    ],
  },

  {
    id: item(2),
    title: "6-Burner Gas Range with Oven Base",
    brand: "Volterra",
    // No model — the badge was gone by the time it reached us. Common.
    model: null,
    category: "cooking",
    subcategory: "cooking-ranges-cooktops",
    grade: "B",
    description:
      "Six open burners over a gas oven base, the workhorse layout for a kitchen that actually cooks. All six burners strip-cleaned and re-jetted for LPG, thermocouples replaced on four of them, and the oven thermostat swapped for a new one. Enamel pan supports show their age and there is a dent in the left side panel — priced accordingly, cooks like new.",
    workshopNotes: [
      "Re-jetted for LPG, six new burner crowns",
      "Four thermocouples replaced",
      "New oven thermostat, calibrated at 180 °C and 220 °C",
    ],
    capacity: "6 burner",
    power: "34 MJ/h",
    dims: [1200, 900, 1150],
    // Nobody weighed it. The scale in the workshop only goes to 60 kg.
    weight: null,
    list: R(18900),
    retail: R(41000),
    tags: ["gas", "heavy-duty"],
    status: "listed",
    published: true,
    featured: false,
    arrived: "2026-06-30",
    costs: [
      { kind: "auction", amount: R(6400) },
      { kind: "buyers_premium", amount: R(960) },
      { kind: "transport", amount: R(1100) },
      { kind: "parts", amount: R(1740), note: "Burner crowns, thermocouples, thermostat" },
      { kind: "labour", amount: R(1800), hours: 9 },
    ],
    media: [
      { kind: "photo", src: "gasRange" },
      { kind: "photo", src: "gasRange", crop: [0.3, 0.55, 0.45, 0.42], label: "burners" },
      { kind: "photo", src: "kitchenPot" },
      { kind: "video", frames: ["gasRange", "kitchenPot"], label: "walkaround" },
    ],
  },

  {
    id: item(3),
    title: "Twin 60 L Stock Pot Range",
    brand: "Ferrolux",
    model: "SP-260",
    category: "cooking",
    subcategory: "cooking-ranges-cooktops",
    grade: "B",
    description:
      "Two 60-litre stock pot burners on a heavy welded frame, the kind of thing a stock kitchen or a caterer doing volume soup runs all day. Both ring burners cleaned and re-seated, new pilot assemblies, and the frame wire-brushed and repainted with high-temperature enamel. Sold to a Woodstock caterer in July.",
    workshopNotes: ["New pilot assemblies on both rings", "Frame stripped and repainted"],
    capacity: "2 × 60 L",
    power: "28 MJ/h",
    dims: [800, 900, 600],
    weight: 96,
    list: R(12750),
    sale: R(11800),
    retail: R(26000),
    tags: ["gas", "heavy-duty"],
    // Sold is not a live stage — it comes off the site on the way through.
    status: "sold",
    published: false,
    featured: false,
    arrived: "2026-05-12",
    soldAt: "2026-07-24T10:20:00+02:00",
    costs: [
      { kind: "auction", amount: R(4100) },
      { kind: "buyers_premium", amount: R(615) },
      { kind: "transport", amount: R(900) },
      { kind: "parts", amount: R(760) },
      { kind: "labour", amount: R(1200), hours: 6 },
    ],
    media: [
      { kind: "photo", src: "stockPots" },
      { kind: "photo", src: "copperPots" },
      { kind: "video", frames: ["stockPots", "copperPots"], label: "walkaround" },
    ],
  },

  {
    id: item(4),
    title: "Countertop Convection Oven",
    // No brand at all — the badge is missing and we are not going to guess.
    brand: null,
    model: null,
    category: "cooking",
    subcategory: "cooking-ovens-combis",
    grade: "C",
    description:
      "An honest grade C. It heats, the fan runs, the timer works and the door shuts square — and it looks every one of its years, with pitting on the top panel and a door glass that will never look clean again. For a food truck, a church hall or a second oven in a back kitchen this is a lot of oven for the money. Sold as seen, six-month warranty on the element and fan.",
    workshopNotes: ["New element", "Fan motor replaced", "Door glass will not clean up — as seen"],
    capacity: "4 × 600 × 400",
    power: "3.1 kW",
    // Never measured. The tape was somewhere else that day.
    dims: [null, null, null],
    weight: 38,
    list: R(4200),
    // No comparable new price we would stand behind.
    retail: null,
    tags: ["electric", "countertop"],
    status: "listed",
    published: true,
    featured: false,
    arrived: "2026-07-08",
    costs: [
      { kind: "auction", amount: R(900) },
      { kind: "buyers_premium", amount: R(135) },
      { kind: "parts", amount: R(680), note: "Element and fan motor" },
      { kind: "labour", amount: R(600), hours: 3 },
    ],
    media: [
      { kind: "photo", src: "vintageOven" },
      { kind: "photo", src: "ovenKnobs" },
      { kind: "video", frames: ["vintageOven", "ovenKnobs"], label: "walkaround" },
    ],
  },

  {
    id: item(5),
    title: "10-Grid Hot Holding Cabinet",
    brand: "Kaldrix",
    model: null,
    category: "cooking",
    // Filed at category level — there is no holding subcategory and inventing
    // one for a single machine is how a taxonomy rots.
    subcategory: null,
    grade: "B",
    // Still in the workshop: no description written yet, no price set.
    description: null,
    workshopNotes: [],
    capacity: "10 × GN 1/1",
    power: null,
    dims: [620, 800, 1750],
    weight: null,
    list: null,
    retail: null,
    tags: ["electric"],
    status: "refurbishing",
    published: false,
    featured: false,
    arrived: "2026-08-02",
    costs: [
      { kind: "auction", amount: R(2800) },
      { kind: "buyers_premium", amount: R(420) },
      { kind: "transport", amount: R(650) },
    ],
    media: [
      { kind: "photo", src: "holdingTrays" },
      { kind: "video", frames: ["holdingTrays"], label: "intake" },
    ],
  },

  {
    id: item(6),
    title: "Triple-Door Glass Display Fridge",
    brand: "Nordika",
    model: "GD-1350",
    category: "refrigeration",
    subcategory: "refrigeration-display",
    grade: "A",
    description:
      "Three glass doors, 1 350 litres, LED-lit and running at a steady 3 °C on test over 72 hours. New door gaskets all round, both fan motors replaced and the condenser chemically cleaned. This is the unit that pays for itself in a bottle store, a deli or a forecourt shop — merchandising space that sells the stock for you.",
    workshopNotes: [
      "Gas topped up, system leak-tested at 72 hours",
      "Three new magnetic door gaskets",
      "Both evaporator fan motors replaced",
      "Condenser chemically cleaned, LED strips renewed",
    ],
    capacity: "1 350 L",
    power: "0.9 kW",
    dims: [1850, 700, 2000],
    weight: 210,
    list: R(24900),
    retail: R(58000),
    tags: ["electric", "glass-door", "heavy-duty"],
    status: "listed",
    published: true,
    featured: true,
    arrived: "2026-06-05",
    costs: [
      { kind: "auction", amount: R(8600) },
      { kind: "buyers_premium", amount: R(1290) },
      { kind: "transport", amount: R(1800), note: "Two-man lift, Bellville" },
      { kind: "parts", amount: R(2450), note: "Gaskets, fan motors, LED strips, gas" },
      { kind: "labour", amount: R(2200), hours: 11 },
    ],
    media: [
      { kind: "photo", src: "displayFridge" },
      { kind: "photo", src: "displayFridge", crop: [0.05, 0.12, 0.5, 0.7], label: "interior" },
      { kind: "photo", src: "kitchenCounter" },
      { kind: "video", frames: ["displayFridge"], label: "walkaround" },
      { kind: "video", frames: ["displayFridge", "kitchenCounter"], crop: [0.2, 0.1, 0.6, 0.75], label: "running" },
    ],
  },

  {
    id: item(7),
    title: "Under-Counter Fridge, 280 L",
    brand: "Nordika",
    model: "UC-280",
    category: "refrigeration",
    subcategory: "refrigeration-under-counter",
    grade: "B",
    description:
      "A 280-litre under-counter fridge on castors, stainless inside and out, holding 4 °C on a 48-hour test. New gasket, new thermostat and a fresh set of castors. Scuffing on the door front from a previous life under a bar counter; nothing that a service pass does not hide. Reserved pending collection.",
    workshopNotes: ["New door gasket and thermostat", "New castors", "Gas checked, no top-up needed"],
    capacity: "280 L",
    power: "0.4 kW",
    dims: [900, 700, 850],
    weight: 78,
    list: R(8900),
    retail: R(19500),
    tags: ["electric", "under-counter", "mobile"],
    // Held for Lindiwe Sithole, who has paid a deposit — off the site.
    status: "reserved",
    published: false,
    featured: false,
    arrived: "2026-07-01",
    costs: [
      { kind: "auction", amount: R(2900) },
      { kind: "buyers_premium", amount: R(435) },
      { kind: "transport", amount: R(600) },
      { kind: "parts", amount: R(890) },
      { kind: "labour", amount: R(800), hours: 4 },
    ],
    media: [
      { kind: "photo", src: "underCounterFridge" },
      { kind: "photo", src: "underCounterFridge", crop: [0.35, 0.2, 0.45, 0.65], label: "door" },
      { kind: "video", frames: ["underCounterFridge"], label: "walkaround" },
    ],
  },

  {
    id: item(8),
    title: "20 L Planetary Mixer",
    brand: "Brennhaus",
    model: "PM-20",
    category: "preparation",
    subcategory: "preparation-mixers",
    grade: "A",
    description:
      "Twenty-litre planetary with all three attachments — hook, paddle and whisk — and a bowl that is not someone else's replacement. Gearbox opened, cleaned and re-oiled, new drive belt, and the three speeds all engage cleanly under load with a 4 kg dough. Very little to fault on this one.",
    workshopNotes: [
      "Gearbox stripped, cleaned and re-oiled",
      "New drive belt",
      "Tested at all three speeds with 4 kg dough",
      "Hook, paddle and whisk all present",
    ],
    capacity: "20 L bowl",
    power: "1.1 kW",
    dims: [520, 600, 800],
    weight: 92,
    list: R(15600),
    retail: R(34000),
    tags: ["electric", "heavy-duty"],
    status: "listed",
    published: true,
    featured: true,
    arrived: "2026-06-22",
    costs: [
      { kind: "auction", amount: R(5200) },
      { kind: "buyers_premium", amount: R(780) },
      { kind: "transport", amount: R(700) },
      { kind: "parts", amount: R(1120), note: "Drive belt, gear oil" },
      { kind: "labour", amount: R(1400), hours: 7 },
    ],
    media: [
      { kind: "photo", src: "bakeryMixer" },
      { kind: "photo", src: "machinePart" },
      { kind: "video", frames: ["bakeryMixer", "machinePart"], label: "walkaround" },
    ],
  },

  {
    id: item(9),
    title: "1 800 mm Stainless Prep Counter",
    brand: "Steelcraft",
    model: null,
    category: "preparation",
    subcategory: "preparation-counters",
    grade: "B",
    description:
      "An 1 800 mm 304-stainless prep bench with an undershelf and adjustable feet. Top polished back to an even finish, one leg straightened and all four feet renewed. There is a shallow dent near the left edge that you will find if you look for it. Non-electric, so nothing to go wrong and nothing to service.",
    workshopNotes: ["Top re-polished", "Left rear leg straightened, four new adjustable feet"],
    capacity: "1 800 mm",
    // Non-electric. Left null rather than written as "none" — the page skips it.
    power: null,
    dims: [1800, 700, 900],
    weight: 52,
    list: R(5400),
    retail: null,
    tags: [],
    status: "listed",
    published: true,
    featured: false,
    arrived: "2026-07-14",
    costs: [
      { kind: "auction", amount: R(1400) },
      { kind: "buyers_premium", amount: R(210) },
      { kind: "labour", amount: R(500), hours: 2.5 },
    ],
    media: [
      { kind: "photo", src: "prepBench" },
      { kind: "video", frames: ["prepBench"], label: "walkaround" },
    ],
  },

  {
    id: item(10),
    title: "Pass-Through Dishwasher, 60 Racks/h",
    brand: "Aquastar",
    model: "PT-60",
    category: "wash-up",
    subcategory: "wash-up-dishwashers",
    grade: "B",
    description:
      "Hood-type pass-through rated at 60 racks an hour, which is the machine a kitchen doing 200 covers needs and the one most of them try to do without. Both pumps stripped and rebuilt, wash and rinse arms descaled, new hood springs and a new drain solenoid. Runs a full cycle in 90 seconds on test.",
    workshopNotes: [
      "Wash and rinse pumps stripped and rebuilt",
      "Arms and boiler descaled",
      "New hood springs and drain solenoid",
    ],
    capacity: "60 racks/h",
    power: "8.4 kW · 400 V 3-phase",
    dims: [740, 800, 1500],
    weight: 104,
    list: R(21500),
    retail: R(47000),
    tags: ["electric", "three-phase", "pass-through"],
    status: "listed",
    published: true,
    featured: false,
    arrived: "2026-06-11",
    costs: [
      { kind: "auction", amount: R(7100) },
      { kind: "buyers_premium", amount: R(1065) },
      { kind: "transport", amount: R(1250) },
      { kind: "parts", amount: R(2980), note: "Pump seals, hood springs, drain solenoid" },
      { kind: "labour", amount: R(2400), hours: 12 },
    ],
    media: [
      { kind: "photo", src: "dishwasher" },
      { kind: "photo", src: "dishwasher", crop: [0.0, 0.15, 0.5, 0.7], label: "hood" },
      { kind: "video", frames: ["dishwasher"], label: "walkaround" },
    ],
  },

  {
    id: item(11),
    title: "Under-Counter Glasswasher",
    brand: "Aquastar",
    model: "GW-30",
    category: "wash-up",
    subcategory: "wash-up-glasswashers",
    grade: "C",
    description:
      "A 30-rack-an-hour under-counter glasswasher out of a Long Street bar. Working, descaled and re-sealed, but cosmetically rough — the front panel is scratched through in two places and the control decal is worn illegible. Priced as a grade C for that reason alone. Back on the floor once the rinse-aid dosing pump lands.",
    workshopNotes: ["Boiler and arms descaled", "New door seal", "Awaiting rinse-aid dosing pump"],
    capacity: "30 racks/h",
    power: "2.8 kW",
    // Only the width was measured before the tape went missing again.
    dims: [470, null, null],
    weight: 41,
    list: R(6800),
    retail: null,
    tags: ["electric", "under-counter"],
    // The stage that only this system has: advertised while the workshop still
    // has it. Priced, photographed, honest about what is outstanding.
    status: "refurbishing",
    published: true,
    featured: false,
    arrived: "2026-07-28",
    costs: [
      { kind: "auction", amount: R(1900) },
      { kind: "buyers_premium", amount: R(285) },
      { kind: "parts", amount: R(1140), note: "Door seal, dosing pump on order" },
      { kind: "labour", amount: R(900), hours: 4.5 },
    ],
    media: [
      { kind: "photo", src: "glassRacks" },
      { kind: "video", frames: ["glassRacks"], label: "walkaround" },
    ],
  },

  {
    id: item(12),
    title: "Double Bowl Sink & Drainer",
    brand: "Steelcraft",
    model: null,
    category: "wash-up",
    subcategory: "wash-up-sinks",
    grade: "B",
    description:
      "Two 500 mm bowls with a left-hand drainer, splashback and undershelf, all in 304 stainless. Both wastes and traps are new. Straightforward, indestructible, and the single most-asked-for item on the floor — they go within a fortnight every time.",
    workshopNotes: ["New wastes and traps on both bowls"],
    capacity: "2 × 500 mm",
    power: null,
    dims: [1600, 700, 900],
    weight: 46,
    list: R(3950),
    retail: null,
    tags: [],
    status: "listed",
    published: true,
    featured: false,
    arrived: "2026-07-19",
    costs: [
      { kind: "auction", amount: R(850) },
      { kind: "buyers_premium", amount: R(128) },
      { kind: "parts", amount: R(320) },
      { kind: "labour", amount: R(400), hours: 2 },
    ],
    media: [
      { kind: "photo", src: "doubleSink" },
      { kind: "video", frames: ["doubleSink"], label: "walkaround" },
    ],
  },

  {
    id: item(13),
    title: "3-Deck 12-Tray Bakery Oven",
    brand: "Brennhaus",
    model: "DK-312",
    category: "bakery",
    subcategory: "bakery-deck-ovens",
    grade: "A",
    description:
      "Three independently controlled decks, twelve trays, steam injection on every deck and stone hearths that are all sound. Every element tested and two replaced, all three steam injectors rebuilt, and the door glass and seals renewed throughout. This is a production oven — it needs a 3-phase supply and a floor that can take a quarter of a tonne, and it will out-bake anything at twice the price.",
    workshopNotes: [
      "Two deck elements replaced, all nine tested",
      "Three steam injectors rebuilt",
      "New door glass and seals on all decks",
      "Hearth stones inspected — all sound, none replaced",
    ],
    capacity: "3 deck · 12 tray",
    power: "18 kW · 400 V 3-phase",
    dims: [1600, 1200, 1800],
    weight: 265,
    list: R(68000),
    retail: R(165000),
    tags: ["electric", "three-phase", "heavy-duty"],
    status: "listed",
    published: true,
    featured: true,
    arrived: "2026-05-28",
    costs: [
      { kind: "auction", amount: R(22400) },
      { kind: "buyers_premium", amount: R(3360) },
      { kind: "transport", amount: R(4200), note: "Crane truck, Paarl" },
      { kind: "parts", amount: R(6800), note: "Elements, injector kits, glass and seals" },
      { kind: "labour", amount: R(5400), hours: 27 },
    ],
    media: [
      { kind: "photo", src: "deckOven" },
      { kind: "photo", src: "deckOven", crop: [0.42, 0.18, 0.5, 0.62], label: "decks" },
      { kind: "photo", src: "kitchenSteam" },
      { kind: "video", frames: ["deckOven", "kitchenSteam"], label: "walkaround" },
      { kind: "video", frames: ["deckOven"], crop: [0.35, 0.2, 0.55, 0.65], label: "decks" },
    ],
  },

  {
    id: item(14),
    title: "Mobile 15-Tray Rack",
    brand: null,
    model: null,
    category: "storage",
    subcategory: "storage-trolleys",
    grade: "B",
    description:
      "A fifteen-tray mobile rack on four braked castors, taking standard 600 × 400 trays. Welds checked and two re-run, all four castors new. Unbranded and none the worse for it. Went to a Mitchells Plain bakery and was collected the same week.",
    workshopNotes: ["Two welds re-run", "Four new braked castors"],
    capacity: "15 tray",
    power: null,
    dims: [470, 660, 1700],
    weight: 28,
    list: R(2650),
    sale: R(2650),
    retail: R(6400),
    tags: ["mobile"],
    status: "sold",
    published: false,
    featured: false,
    arrived: "2026-04-20",
    soldAt: "2026-06-02T14:05:00+02:00",
    costs: [
      { kind: "auction", amount: R(600) },
      { kind: "buyers_premium", amount: R(90) },
      { kind: "parts", amount: R(340), note: "Castors" },
      { kind: "labour", amount: R(300), hours: 1.5 },
    ],
    media: [
      { kind: "photo", src: "trayRack" },
      { kind: "video", frames: ["trayRack"], label: "walkaround" },
    ],
  },

  {
    id: item(15),
    // A machine that came off the truck this morning. Almost nothing is known
    // about it yet, which is exactly what the intake column should look like.
    title: "Wall shelf run — Epping lot 61",
    brand: null,
    model: null,
    category: "storage",
    subcategory: null,
    grade: null,
    description: null,
    workshopNotes: [],
    capacity: null,
    power: null,
    dims: [null, null, null],
    weight: null,
    list: null,
    retail: null,
    tags: [],
    // In the workshop, which is a live stage — but with no price and no
    // description the publish gate will refuse it, which is the right answer.
    status: "refurbishing",
    published: false,
    featured: false,
    arrived: "2026-08-11",
    costs: [{ kind: "auction", amount: R(1200), note: "Epping, lot 61 — three shelves" }],
    media: [
      { kind: "photo", src: "wallShelf" },
      { kind: "video", frames: ["wallShelf"], label: "intake" },
    ],
  },
];

/**
 * Fifteen people.
 *
 * Contactability is deliberately uneven — some left only a phone number, some
 * only an email, one is unsubscribed and one has no consent recorded at all, so
 * the outreach queue has to prove it honours that rather than being told it
 * does. `interests` is the structured half of what they want; `events` is the
 * timeline a worker reads before saying hello.
 *
 * `item` on an interest refers to an index into ITEMS above (1-based, matching
 * the item() ids), resolved by the seed script.
 */
export const LEADS = [
  {
    id: lead(1),
    full_name: "Sipho Ndlovu",
    business_name: "Ndlovu Catering Co.",
    email: "sipho@ndlovucatering.co.za",
    phone: "082 555 0134",
    birthday: "1984-03-19",
    source: "website_product",
    status: "working",
    notes: "Does weddings and corporate out of Khayelitsha. Buys on margin, not on brand. Only collects on Saturdays.",
    emailConsent: "2026-07-02T09:14:00+02:00",
    whatsappConsent: "2026-07-02T09:14:00+02:00",
    consentSource: "website:product-form",
    createdAt: "2026-07-02T09:14:00+02:00",
    interests: [
      { item: 1, category: "cooking", subcategory: "cooking-ovens-combis", budget: R(50000), minGrade: "B", description: "Needs a combi that can hold 200 covers of chicken without drying it out. Asked about the 6-grid." },
      { item: null, category: "refrigeration", subcategory: "refrigeration-upright", budget: R(30000), description: "Also looking for an upright freezer, two-door if we get one." },
    ],
    events: [
      { kind: "enquiry", at: "2026-07-02T09:14:00+02:00", body: "Enquired about the 6-Grid Combi Steamer through the website.", item: 1 },
      { kind: "call", at: "2026-07-02T15:40:00+02:00", body: "Called back. Wants to see it running before he commits. Coming Saturday." },
      { kind: "visit", at: "2026-07-05T10:05:00+02:00", body: "Came in, spent forty minutes on the combi. Asked twice about the warranty." },
      { kind: "note", at: "2026-07-05T16:00:00+02:00", body: "Waiting on his own client to confirm a December contract before he buys." },
    ],
  },
  {
    id: lead(2),
    full_name: "Anél du Toit",
    business_name: "Die Blou Tafel, Durbanville",
    email: "anel@dieblouTafel.co.za",
    phone: "021 976 4412",
    birthday: null,
    source: "referral",
    status: "customer",
    notes: "Referred by her brother-in-law who bought the stock pot range. Pays cash on collection, always.",
    emailConsent: "2026-05-14T11:00:00+02:00",
    whatsappConsent: null,
    consentSource: "counter: signed intake slip",
    createdAt: "2026-05-14T11:00:00+02:00",
    interests: [
      { item: 13, category: "bakery", subcategory: "bakery-deck-ovens", budget: R(80000), minGrade: "A", description: "Opening a bakery arm next door. Wants a three-deck, electric, and it must be grade A — no projects." },
    ],
    events: [
      { kind: "visit", at: "2026-05-14T11:00:00+02:00", body: "Walked in with her brother-in-law. Left details at the counter." },
      { kind: "purchased", at: "2026-05-30T13:20:00+02:00", body: "Bought a double bowl sink and two prep benches. R11 400 cash." },
      { kind: "email_sent", at: "2026-07-11T08:30:00+02:00", body: "Sent her the deck oven listing the morning it went up.", item: 13 },
      { kind: "note", at: "2026-07-11T17:02:00+02:00", body: "Replied same day — wants to bring her baker to look at it before deciding." },
    ],
  },
  {
    id: lead(3),
    full_name: "Riaan Pretorius",
    business_name: null,
    email: null, // Phone only. He would not give an address.
    phone: "073 555 0198",
    birthday: null,
    source: "whatsapp",
    status: "new",
    notes: "Messaged the WhatsApp line at 22:40. Short answers. Might be a reseller.",
    emailConsent: null,
    whatsappConsent: "2026-08-04T22:41:00+02:00",
    consentSource: "whatsapp: opted in on first message",
    createdAt: "2026-08-04T22:41:00+02:00",
    interests: [
      { item: null, category: "cooking", subcategory: "cooking-ranges-cooktops", budget: R(20000), description: "Wants a six burner gas range, cheapest available, does not care about condition." },
    ],
    events: [
      { kind: "enquiry", at: "2026-08-04T22:41:00+02:00", body: "WhatsApp: 'six plate gas stove how much'" },
      { kind: "whatsapp_sent", at: "2026-08-05T08:12:00+02:00", body: "Sent him the Volterra range listing and the price." },
    ],
  },
  {
    id: lead(4),
    full_name: "Fatima Adams",
    business_name: "Adams Fisheries, Kalk Bay",
    email: "orders@adamsfisheries.co.za",
    phone: "082 555 0277",
    birthday: "1971-11-08",
    source: "walk_in",
    status: "customer",
    notes: "Third purchase with us. Knows exactly what she wants and negotiates hard. Worth it.",
    emailConsent: "2026-03-09T10:00:00+02:00",
    whatsappConsent: "2026-03-09T10:00:00+02:00",
    consentSource: "counter: signed intake slip 09/03",
    createdAt: "2026-03-09T10:00:00+02:00",
    interests: [
      { item: 6, category: "refrigeration", subcategory: "refrigeration-display", budget: R(30000), description: "Wants a glass door display for the shop front, three door if possible. Must be able to hold 2 °C." },
      { item: null, category: "wash-up", subcategory: "wash-up-sinks", description: "And a double sink for the back, whenever one comes in." },
    ],
    events: [
      { kind: "purchased", at: "2026-03-20T12:00:00+02:00", body: "Under-counter fridge and a prep bench. R13 100." },
      { kind: "purchased", at: "2026-06-14T11:30:00+02:00", body: "Second under-counter fridge. R8 400." },
      { kind: "enquiry", at: "2026-08-01T09:20:00+02:00", body: "Phoned about display fridges. Sent her the Nordika.", item: 6 },
      { kind: "match_sent", at: "2026-08-01T09:45:00+02:00", body: "WhatsApp with the triple-door listing.", item: 6 },
    ],
  },
  {
    id: lead(5),
    full_name: "Thabo Mokoena",
    business_name: "Mokoena Spaza & Takeaway",
    email: "thabo.mokoena84@gmail.com",
    phone: "076 555 0311",
    birthday: null,
    source: "website_general",
    status: "new",
    notes: null,
    // Ticked email only on the general form.
    emailConsent: "2026-08-07T19:22:00+02:00",
    whatsappConsent: null,
    consentSource: "website:general-form",
    createdAt: "2026-08-07T19:22:00+02:00",
    interests: [
      { item: null, category: "refrigeration", subcategory: null, budget: R(12000), description: "Something to keep cold drinks in for the shop at the taxi rank. Must have glass doors so people can see in." },
    ],
    events: [
      { kind: "enquiry", at: "2026-08-07T19:22:00+02:00", body: "Website enquiry — cold drinks fridge for a spaza, budget around R10 000." },
    ],
  },
  {
    id: lead(6),
    full_name: "Chef Marco Bianchi",
    business_name: "Osteria 44, Green Point",
    email: "marco@osteria44.co.za",
    phone: null, // Email only — he never answers a phone during service.
    birthday: "1979-06-30",
    source: "website_product",
    status: "working",
    notes: "Will only talk between 15:00 and 17:00. Wants provenance on everything — tell him where it came from.",
    emailConsent: "2026-07-18T15:30:00+02:00",
    whatsappConsent: null,
    consentSource: "website:product-form",
    createdAt: "2026-07-18T15:30:00+02:00",
    interests: [
      { item: 10, category: "wash-up", subcategory: "wash-up-dishwashers", budget: R(25000), minGrade: "B", description: "Pass-through dishwasher, 60 racks minimum. Current one dies mid-service twice a week." },
      { item: 8, category: "preparation", subcategory: "preparation-mixers", budget: R(20000), minGrade: "A", description: "A 20 litre planetary for pasta dough. Grade A only, it runs six hours a day." },
    ],
    events: [
      { kind: "enquiry", at: "2026-07-18T15:30:00+02:00", body: "Enquired about the pass-through dishwasher.", item: 10 },
      { kind: "email_sent", at: "2026-07-18T16:10:00+02:00", body: "Sent full workshop notes and the pump rebuild detail.", item: 10 },
      { kind: "note", at: "2026-07-22T15:05:00+02:00", body: "Asked about the mixer too. Two machines in play — quote them separately." },
    ],
  },
  {
    id: lead(7),
    full_name: "Nomsa Dlamini",
    business_name: "Ubuntu Kitchen NPC",
    email: "nomsa@ubuntukitchen.org.za",
    phone: "021 447 8890",
    birthday: null,
    source: "phone",
    status: "working",
    notes: "Feeding scheme in Langa, 400 meals a day. Buying on a donor grant — needs a formal quote on a letterhead, not a WhatsApp.",
    emailConsent: "2026-06-25T10:45:00+02:00",
    whatsappConsent: null,
    consentSource: "phone: agreed on call 25/06",
    createdAt: "2026-06-25T10:45:00+02:00",
    interests: [
      { item: null, category: "cooking", subcategory: "cooking-ranges-cooktops", budget: R(15000), description: "Two big stock pot burners for soup. Gas, because the power goes." },
      { item: null, category: "storage", subcategory: "storage-shelving", budget: R(6000), description: "Shelving for the dry store, as much as the budget takes." },
    ],
    events: [
      { kind: "call", at: "2026-06-25T10:45:00+02:00", body: "Phoned in. Grant application closes end of September." },
      { kind: "email_sent", at: "2026-06-26T09:00:00+02:00", body: "Sent a formal quote for the stock pot range and shelving." },
      { kind: "note", at: "2026-07-30T11:00:00+02:00", body: "Chased. Grant still with the donor. Follow up mid-September." },
    ],
  },
  {
    id: lead(8),
    full_name: "Deon van Wyk",
    business_name: "Van Wyk Butchery, Goodwood",
    email: "deon@vanwykbutchery.co.za",
    phone: "083 555 0442",
    birthday: "1966-01-25",
    source: "referral",
    status: "dormant",
    notes: "Bought a slicer in 2025 and has not been back. Worth a call when a butchery lot comes through.",
    emailConsent: "2025-11-02T10:00:00+02:00",
    whatsappConsent: "2025-11-02T10:00:00+02:00",
    consentSource: "counter: signed intake slip",
    createdAt: "2025-11-02T10:00:00+02:00",
    lastContacted: "2026-02-14T09:00:00+02:00",
    interests: [
      { item: null, category: "preparation", subcategory: "preparation-slicers", budget: R(18000), description: "Second bandsaw or a heavy slicer, whenever a butchery closes down.", active: true },
    ],
    events: [
      { kind: "purchased", at: "2025-11-02T10:00:00+02:00", body: "Meat slicer, R9 800." },
      { kind: "call", at: "2026-02-14T09:00:00+02:00", body: "Courtesy call. Nothing needed right now." },
    ],
  },
  {
    id: lead(9),
    full_name: "Zanele Khumalo",
    business_name: null,
    email: "zanele.khumalo@outlook.com",
    phone: "081 555 0509",
    birthday: "1993-09-12",
    source: "website_general",
    status: "new",
    notes: "Starting a home bakery. First-time buyer — will need hand-holding on delivery and power requirements.",
    emailConsent: "2026-08-09T20:10:00+02:00",
    whatsappConsent: "2026-08-09T20:10:00+02:00",
    consentSource: "website:general-form",
    createdAt: "2026-08-09T20:10:00+02:00",
    interests: [
      { item: null, category: "bakery", subcategory: null, budget: R(20000), description: "Anything for a small bakery starting out — an oven and a mixer. Working from a garage in Parow so it must run on normal plug power." },
      { item: 8, category: "preparation", subcategory: "preparation-mixers", budget: R(16000), description: "Saw the 20 litre planetary on the site. Is it too big for a garage?" },
    ],
    events: [
      { kind: "enquiry", at: "2026-08-09T20:10:00+02:00", body: "Website enquiry. Home bakery, garage in Parow, single phase only." },
      { kind: "email_sent", at: "2026-08-10T08:15:00+02:00", body: "Explained single vs three phase and sent the mixer and the countertop oven.", item: 8 },
    ],
  },
  {
    id: lead(10),
    full_name: "Yusuf Patel",
    business_name: "Patel's Grill House, Rylands",
    email: null,
    phone: "084 555 0620",
    birthday: null,
    source: "walk_in",
    status: "working",
    notes: "Comes in most months to see what is new. Never buys on the first visit, always buys on the third.",
    emailConsent: null,
    whatsappConsent: "2026-04-11T14:00:00+02:00",
    consentSource: "counter: agreed at the counter 11/04",
    createdAt: "2026-04-11T14:00:00+02:00",
    interests: [
      { item: null, category: "cooking", subcategory: "cooking-fryers-griddles", budget: R(12000), description: "A twin basket fryer, gas preferably. Has been waiting since April." },
      { item: 2, category: "cooking", subcategory: "cooking-ranges-cooktops", budget: R(22000), description: "Also had a good look at the six burner." },
    ],
    events: [
      { kind: "visit", at: "2026-04-11T14:00:00+02:00", body: "First visit. Left a number." },
      { kind: "visit", at: "2026-06-08T15:30:00+02:00", body: "Second visit. Looked at the six burner for a long time." },
      { kind: "whatsapp_sent", at: "2026-07-15T09:00:00+02:00", body: "Told him no fryers in yet. Said he would wait." },
    ],
  },
  {
    id: lead(11),
    full_name: "Lindiwe Sithole",
    business_name: "The Corner Deli, Observatory",
    email: "hello@cornerdeli.co.za",
    phone: "072 555 0733",
    birthday: null,
    source: "website_product",
    status: "working",
    notes: null,
    emailConsent: "2026-07-26T12:05:00+02:00",
    whatsappConsent: "2026-07-26T12:05:00+02:00",
    consentSource: "website:product-form",
    createdAt: "2026-07-26T12:05:00+02:00",
    interests: [
      { item: 7, category: "refrigeration", subcategory: "refrigeration-under-counter", budget: R(10000), minGrade: "B", description: "Under-counter fridge to go under the deli counter. 900 wide maximum, it has to fit the gap." },
    ],
    events: [
      { kind: "enquiry", at: "2026-07-26T12:05:00+02:00", body: "Enquired about the 280 L under-counter.", item: 7 },
      { kind: "call", at: "2026-07-26T16:20:00+02:00", body: "Measured the gap with her on the phone — 920 mm. It fits." },
      { kind: "note", at: "2026-08-03T10:00:00+02:00", body: "Paid a holding deposit. Collecting once her bakkie is out of the shop." },
    ],
  },
  {
    id: lead(12),
    full_name: "Pieter Joubert",
    business_name: "Joubert Wine Estate, Stellenbosch",
    email: "events@joubertwines.co.za",
    phone: "021 883 1120",
    birthday: null,
    source: "phone",
    status: "new",
    // Opted out after one newsletter. Every send path must honour this in SQL.
    unsubscribedAt: "2026-08-06T07:30:00+02:00",
    notes: "Unsubscribed after the first newsletter. Do not add him to a campaign — phone him if something specific comes in.",
    emailConsent: "2026-07-29T14:00:00+02:00",
    whatsappConsent: null,
    consentSource: "phone: agreed on call 29/07",
    createdAt: "2026-07-29T14:00:00+02:00",
    interests: [
      { item: null, category: "wash-up", subcategory: "wash-up-glasswashers", budget: R(15000), description: "Glasswasher for the tasting room. Wine glasses, so it must be gentle and it must be quiet." },
    ],
    events: [
      { kind: "call", at: "2026-07-29T14:00:00+02:00", body: "Wants a glasswasher for the tasting room before harvest." },
      { kind: "email_sent", at: "2026-08-05T08:00:00+02:00", body: "August stock newsletter." },
    ],
  },
  {
    id: lead(13),
    full_name: null, // Nobody caught the name. Phone number only.
    business_name: "Guest house, Sea Point (name not taken)",
    email: null,
    phone: "079 555 0844",
    birthday: null,
    source: "phone",
    status: "new",
    notes: "Rang about a dishwasher, was in a hurry, said he would call back. Whoever picks up next: get a name.",
    emailConsent: null,
    whatsappConsent: null,
    consentSource: null,
    createdAt: "2026-08-10T16:48:00+02:00",
    interests: [
      { item: null, category: "wash-up", subcategory: "wash-up-dishwashers", budget: null, description: "Dishwasher for a guest house, twelve rooms. No other detail taken." },
    ],
    events: [
      { kind: "call", at: "2026-08-10T16:48:00+02:00", body: "Two minute call. Dishwasher for a twelve-room guest house. No name, no email." },
    ],
  },
  {
    id: lead(14),
    full_name: "Grace Mutasa",
    business_name: "Mama Grace Kitchen, Bellville",
    email: "mamagracekitchen@gmail.com",
    phone: "078 555 0955",
    birthday: "1988-12-04",
    source: "auction",
    status: "working",
    notes: "Met her at the Epping auction — she was bidding on the same lot. Better she buys it from us refurbished.",
    emailConsent: "2026-07-09T18:00:00+02:00",
    whatsappConsent: "2026-07-09T18:00:00+02:00",
    consentSource: "in person: Epping auction 09/07",
    createdAt: "2026-07-09T18:00:00+02:00",
    interests: [
      { item: null, category: "cooking", subcategory: null, budget: R(35000), description: "Kitting out a second branch. Needs most of a kitchen — an oven, a range, a fridge and prep tables." },
      { item: 9, category: "preparation", subcategory: "preparation-counters", budget: R(7000), description: "Two prep counters, 1800 if you have them." },
      { item: 12, category: "wash-up", subcategory: "wash-up-sinks", budget: R(5000), description: "A double bowl sink with a drainer." },
    ],
    events: [
      { kind: "visit", at: "2026-07-09T18:00:00+02:00", body: "Met at the Epping auction. Took her number there." },
      { kind: "visit", at: "2026-07-17T10:30:00+02:00", body: "Came to the warehouse with a shopping list. Serious buyer." },
      { kind: "whatsapp_sent", at: "2026-08-08T09:10:00+02:00", body: "Sent the prep counter and the double sink.", item: 9 },
    ],
  },
  {
    id: lead(15),
    full_name: "Hennie Barnard",
    business_name: "Barnard Bros Plant Hire",
    email: "hennie@barnardbros.co.za",
    phone: "082 555 1066",
    birthday: null,
    source: "import",
    status: "dormant",
    notes: "Came across from the old spreadsheet. Bought a tray rack in 2024. No consent recorded — do not email until he confirms.",
    emailConsent: null,
    whatsappConsent: null,
    consentSource: null,
    createdAt: "2026-01-15T08:00:00+02:00",
    lastContacted: "2026-01-15T08:00:00+02:00",
    interests: [
      { item: null, category: "storage", subcategory: "storage-trolleys", budget: R(4000), description: "Mobile racks for the site canteen.", active: false },
    ],
    events: [
      { kind: "note", at: "2026-01-15T08:00:00+02:00", body: "Imported from the old stock spreadsheet. Bought a tray rack in 2024." },
    ],
  },
];
