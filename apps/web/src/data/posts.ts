/**
 * The Journal.
 *
 * The prose was written for the MVP so the Journal had real, useful content
 * rather than lorem. The advice reflects how the business actually works — but
 * the rand figures in it are illustrative, and they are presented to somebody
 * deciding how to spend their money, so none of it publishes until it has been
 * checked.
 *
 * That check is recorded in `launch.ts`, not here: `posts` below is the full
 * set of drafts, and the exported `posts` is filtered down to the ones whose
 * slug appears in the manifest with a verification date. The photograph for
 * each post comes from the manifest too, which is what keeps the stock-photo
 * URLs out of this file and confined to the one place the launch gate allows
 * them.
 */
// Explicit .ts extension, matching the convention in packages/core: it is what
// lets plain `node` resolve this module, which scripts/check-launch-ready.mjs
// depends on to read the draft slugs from the real file rather than guess at
// them with a regex.
import { isVerified, posts as postFacts } from "./launch.ts";

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "quote"; text: string };

/** A post as a page renders it: the draft, plus the photograph from the manifest. */
export type Post = Draft & { image: string; imageAlt: string };

/** A post as it is written. No photograph — that is a separate thing to verify. */
type Draft = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO
  readingMinutes: number;
  tag: string;
  body: Block[];
};

const drafts: Draft[] = [
  {
    slug: "what-a-second-hand-combi-oven-should-cost",
    title: "What a second-hand combi oven should actually cost",
    excerpt:
      "Combis hold their value better than anything else in a kitchen, which is exactly why the used market is full of overpriced ones. Here is how we price them.",
    date: "2026-07-22",
    readingMinutes: 6,
    tag: "Buying guide",
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
          "Under three years old, full history: 55–65% of new. Rare, and worth paying for when it appears.",
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
    slug: "nine-checks-before-you-buy-used-equipment",
    title: "Nine checks between a bargain and a scrapheap",
    excerpt:
      "Almost every machine that dies in month two failed one of these nine checks before it was sold. Run the list on anything you are looking at — ours included.",
    date: "2026-06-30",
    readingMinutes: 7,
    tag: "Buying guide",
    body: [
      {
        kind: "p",
        text: "A cheap fridge stops being cheap the first Friday it fails. You lose the stock, you lose the weekend, and you pay a call-out on Monday to be told the compressor has been dying for a year. The saving disappears in a single service.",
      },
      {
        kind: "p",
        text: "That is the real cost of buying a machine nobody has opened up. Below is the inspection we run on every unit before it earns a price — nine checks, in the order we do them. Use it on anything you are considering.",
      },
      { kind: "h", text: "The nine" },
      {
        kind: "list",
        items: [
          "Model and serial plate present and legible. No plate means no parts in three years, and parts availability is the whole game on a machine you intend to keep.",
          "Every door gasket, closed on a sheet of paper. If the paper slides out freely the seal is gone, and on refrigeration that means the compressor never stops running.",
          "Underneath, at the feet. Corrosion low down means the machine stood in standing water, and everything above it has been in a wet room for years.",
          "The condenser coil, cover off. Packed solid with grease means the compressor has been working against itself for a long time and has little life left.",
          "Burner grates and heat colouring on gas. Even bluing is normal. Warped or cracked cast iron is a replacement part, not a clean-up.",
          "The inside of every cold unit, by smell. Mould in the insulation is not something anybody cleans out — the panel has to come off.",
          "A full cycle from cold, under load, watched to the end. Not switched on for thirty seconds. Everything expensive shows up in the last two minutes of a real cycle.",
          "Core and rinse temperatures against a reference probe, not the machine's own display. A dishwasher that cannot reach 82 °C on rinse will not pass a health inspection.",
          "Electrical supply and physical access, measured. A three-phase machine in a single-phase building is worth nothing until an electrician has been paid, and that quote can exceed the price of the machine.",
        ],
      },
      { kind: "h", text: "What skipping them costs" },
      {
        kind: "p",
        text: "None of these checks are difficult. They are just slow, and they need power on site, a reference instrument and someone who has opened enough machines to know what they are looking at. That combination is exactly what a private sale on a Saturday morning cannot give you.",
      },
      {
        kind: "p",
        text: "So the risk gets passed to you at the point of payment, and it shows up later as a repair bill, a lost service, or a machine standing against a wall waiting for a part that was never made for the local market.",
      },
      {
        kind: "quote",
        text: "If you only do one of the nine, run a full cycle from cold and watch it to the end. Everything expensive shows up in those ten minutes.",
      },
      { kind: "h", text: "Or skip the list" },
      {
        kind: "p",
        text: "Every unit on our floor has been through all nine before it was priced, with the worn parts replaced rather than cleaned, the results published on its listing, and six months of parts-and-labour warranty behind it. You are welcome to run the checks again yourself in Montague Gardens before you pay — we would rather you did.",
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

/**
 * The posts that actually publish.
 *
 * Manifest order, not draft order, so the Journal's running order is something
 * Carlo controls by rearranging launch.ts. A verified entry whose slug has no
 * draft is skipped rather than throwing — a typo in a slug should cost one post,
 * not the whole build. The launch gate reports that mismatch separately.
 */
export const posts: Post[] = postFacts.flatMap((fact) => {
  if (!isVerified(fact)) return [];
  const draft = drafts.find((candidate) => candidate.slug === fact.value.slug);
  if (!draft) return [];
  return [{ ...draft, image: fact.value.image.src, imageAlt: fact.value.image.alt }];
});

/** Every slug that has prose written for it, verified or not. Used by the gate. */
export const draftSlugs = drafts.map((draft) => draft.slug);

export const postBySlug = (slug: string) => posts.find((post) => post.slug === slug);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
