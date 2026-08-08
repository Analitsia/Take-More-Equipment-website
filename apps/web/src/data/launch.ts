/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  EVERY CLAIM THIS WEBSITE MAKES ABOUT THE REAL WORLD, IN ONE FILE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the file Carlo edits. Nothing else on the site should hardcode a
 * phone number, a statistic, a customer quote or a photograph — it comes from
 * here, and it only reaches a visitor once somebody has said it is true.
 *
 * WHY THIS EXISTS
 * ---------------
 * The mockup shipped with an invented phone number on every CTA, nine invented
 * customer testimonials with real-sounding names and Cape Town suburbs
 * attached, four unchecked statistics, stock photography from Unsplash, and
 * four blog posts whose own header called the rand figures illustrative. Next
 * to all of that, `next.config.mjs` claimed "CI refuses a production deploy
 * that contains any [placeholder media]" — and there was no CI at all.
 *
 * Publishing invented customer quotes is not a content nit. Attributing words
 * to a named person in a named suburb who never said them is a consumer
 * protection and advertising standards problem. So the default here is that
 * nothing is published until it is verified, and the enforcement is mechanical
 * rather than a comment asking somebody to remember.
 *
 * HOW A FACT WORKS
 * ----------------
 * Three independent signals, and it takes all three to publish something:
 *
 *   1. `verified` is an ISO date. null means nobody has checked it.
 *   2. `value` must differ from `placeholder`. `placeholder` freezes the mockup
 *      value, so "unfilled" is detected by comparison with the recorded
 *      original rather than by grepping for magic strings. You cannot set a
 *      date on a fact you have not actually changed.
 *   3. Shape rules the gate applies — a phone number has to parse, a
 *      registration number has to look like a CIPC one, a photograph must not
 *      be hosted on a stock-photo CDN.
 *
 * TWO KINDS OF FACT, AND THE DIFFERENCE MATTERS
 * ---------------------------------------------
 *   BLOCKING (`contact` below). The site cannot honestly function without
 *   these — a storefront with no phone number is broken, not "degraded". So a
 *   PRODUCTION BUILD FAILS while any of them is unverified. See
 *   assertProductionReady() at the bottom of this file: it runs at module load
 *   in site.ts, and every page imports site.ts, so there is no route to a
 *   production bundle carrying an invented number. This is deliberate. If a
 *   deploy fails with a message pointing here, that is the system working.
 *
 *   WITHHELD (everything else). The site is fine without them, so unverified
 *   items simply do not render and the layout closes up. Nothing is deleted —
 *   the mockup copy stays right here, and you publish an item by filling in
 *   its `verified` date. One quote can go live on its own.
 *
 * WHEN YOU ARE READY
 * ------------------
 * Flip `launchState` to "live" at the bottom. Unverified facts stop being
 * warnings and become hard CI failures, so nothing can quietly regress after
 * cutover. Run `npm run check:launch` at any time to see exactly what is left.
 */

export type Fact<T> = {
  /** What the site will publish, once this is verified. */
  value: T;
  /** ISO date somebody checked this against reality. null = nobody has. */
  verified: string | null;
  /** What checking meant. Printed by the launch gate. Be specific. */
  evidence: string;
  /** The mockup value, frozen. Equal to `value` means still unfilled. */
  placeholder?: T;
};

export type LaunchState = "pre-launch" | "live";

export type Testimonial = { name: string; loc: string; text: string };
export type Media = { src: string; alt: string };
export type Stat = { number: string; suffix: string; label: string };
export type Processor = { name: string; purpose: string };
export type PostRecord = { slug: string; image: Media };

/** Hosts that are, by definition, not photographs of this business. */
export const PLACEHOLDER_HOSTS = ["images.unsplash.com", "i.pravatar.cc"] as const;

const unverified = <T,>(value: T, evidence: string): Fact<T> => ({
  value,
  verified: null,
  evidence,
  placeholder: value,
});

// ───────────────────────────────────────────────────────────────────────────
// CONTACT — blocking. A production build fails while any of these is unfilled.
// ───────────────────────────────────────────────────────────────────────────

export const contact = {
  phone: unverified("+27 21 555 0134", "Ring it. It must reach the warehouse."),
  whatsapp: unverified(
    "+27215550134",
    "Message it from a phone that is not ours and check it arrives. Digits only, full international form, no +."
  ),
  email: unverified(
    "sales@takemoreequipment.co.za",
    "Send to it from outside and confirm somebody receives it."
  ),
  address: unverified(
    "Montague Gardens, Cape Town",
    "The address a customer should drive to. Street and number, not just the suburb."
  ),
  hours: unverified(
    "Mon–Fri 08:00–17:00 · Sat 08:00–13:00",
    "The hours somebody will actually be there."
  ),
  legalName: unverified(
    "Take More Catering Equipment (Pty) Ltd",
    "Exactly as registered at CIPC, including the (Pty) Ltd."
  ),
  /**
   * POPIA s18 requires a data subject be told who is responsible for their
   * information, at the point of collection. Every enquiry form on this site
   * links to /privacy, and /privacy has to name these two.
   */
  registrationNumber: unverified(
    "0000/000000/00",
    "From the CIPC registration certificate. Form YYYY/NNNNNN/NN."
  ),
  informationOfficer: unverified(
    "Not yet appointed",
    "The person registered with the Information Regulator. By default the head of the business, but it must be a named human being."
  ),
  domain: unverified(
    "takemoreequipment.co.za",
    "The domain this actually serves from, no protocol, no www."
  ),
} as const;

// ───────────────────────────────────────────────────────────────────────────
// CLAIMS — withheld. Unverified stats do not render; the row closes up.
// ───────────────────────────────────────────────────────────────────────────

export const claims = {
  machinesRebuilt: unverified<Stat>(
    { number: "600", suffix: "+", label: "Machines Rebuilt" },
    "A number you can defend from the workshop records. If you cannot count them, do not publish it."
  ),
  averageSaving: unverified<Stat>(
    { number: "50", suffix: "%", label: "Average Saving vs New" },
    "Take a sample of sold units, compare each to its new-equivalent quote, and average honestly."
  ),
  warranty: unverified<Stat>(
    { number: "6", suffix: "Mo", label: "Workshop Warranty" },
    "This is a promise you are legally held to. It must match the warranty terms you actually issue."
  ),
  delivery: unverified<Stat>(
    { number: "48", suffix: "H", label: "Cape Town Delivery" },
    "Must match what /delivery says and what actually happens. A missed delivery promise is a refund claim."
  ),
  /** Rendered as prose in the /about intro and its metadata description. */
  pricedBelowNewRange: unverified(
    "40–60%",
    "The range you can defend across the catalogue, not the best case."
  ),
  /** The 'a new line costs this much' figure the /about problem section leans on. */
  newLineCost: unverified(
    "R380 000",
    "A real quote for a 60-seat line, dated. Prices move; note when you checked."
  ),
} as const;

// ───────────────────────────────────────────────────────────────────────────
// TESTIMONIALS — withheld, and the most legally sensitive thing on the site.
//
// Publish a quote only when: a real customer said it, you can point at where
// (WhatsApp thread, email, Google review), and they are content to be named.
// Under three verified quotes the section renders a proof panel instead, built
// only from things that are already true and checkable — see Testimonials.tsx.
// ───────────────────────────────────────────────────────────────────────────

export const testimonials: Fact<Testimonial>[] = [
  unverified(
    {
      name: "Nadia Petersen",
      loc: "Woodstock",
      text: "We opened with a combi, a range and a double under-counter for what one new combi would have cost. Eighteen months later all three are still running six services a week.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Sipho Ndlovu",
      loc: "Salt River",
      text: "They sent me photos of the replaced element before I paid a cent. No dealer has ever done that for me, new or otherwise.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Marco da Silva",
      loc: "Sea Point",
      text: "Ordered on the Tuesday, delivered and levelled in my kitchen on the Thursday. No drama, no surprise costs at the door.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Aisha Solomon",
      loc: "Observatory",
      text: "The thermostat went at month four. They collected it, fixed it and returned it with nothing to pay. That is the whole reason I would buy from them again.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Johan Brits",
      loc: "Paarden Eiland",
      text: "I run three coffee shops. Every stainless table and under-counter fridge in all three came out of that warehouse.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Thandeka Mokoena",
      loc: "Muizenberg",
      text: "Seeing the actual unit with its actual scratches before driving out there saved me two wasted trips across town.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Riaan Kloppers",
      loc: "Durbanville",
      text: "Graded B, priced like a B, performs like an A. They were straight with me about the dent and knocked it off the price before I asked.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Fatima Adams",
      loc: "Athlone",
      text: "I sent a photo of the gap in my line on a Saturday. By Monday they had two options with prices and dimensions in my inbox.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Grant Michaels",
      loc: "Somerset West",
      text: "Fitting out a second site from new would have taken my whole budget. We did it for under half and kept cash for staff.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
];

// ───────────────────────────────────────────────────────────────────────────
// MEDIA — withheld. This file is the ONLY place a stock-photo URL may appear;
// the launch gate fails the build if one turns up anywhere else in apps/web.
//
// Real photography goes in the `item-media` Storage bucket under a `site/`
// prefix and is referenced by its public URL, exactly like item photography.
// ───────────────────────────────────────────────────────────────────────────

const stock = (id: string) =>
  `https://images.unsplash.com/${id}?q=80&w=1200&auto=format&fit=crop`;

export const media = {
  hero: unverified<Media>(
    {
      src: "https://images.unsplash.com/photo-1708915965975-2a950db0e215?q=80&w=2938&auto=format&fit=crop",
      alt: "Refurbished commercial kitchen line",
    },
    "A photograph of your own workshop or a line you fitted. Landscape, at least 2000px wide."
  ),
  aboutWorkshop: unverified<Media>(
    {
      src: stock("photo-1589109807644-924edf14ee09"),
      alt: "Stainless wash-up line in the workshop",
    },
    "The actual wash-up line the caption describes. 4:3 works best."
  ),
} as const;

// ───────────────────────────────────────────────────────────────────────────
// JOURNAL — withheld. The prose lives in posts.ts; what needs checking is the
// figures inside it and the photograph on top of it, so that is what is
// recorded here. A post renders only if its slug appears below and is verified.
//
// posts.ts flagged itself: "figures are illustrative and should be checked
// before publishing". These posts quote hard rand figures — R42 500 against
// R98 000, "a saving of R215 350, or 56%" — presented as fact to somebody
// deciding how to spend their money. Check them or do not publish them.
// ───────────────────────────────────────────────────────────────────────────

export const posts: Fact<PostRecord>[] = [
  unverified<PostRecord>(
    {
      slug: "what-a-second-hand-combi-oven-should-cost",
      image: {
        src: stock("photo-1707255280298-e540809f4c01"),
        alt: "Combi oven in the workshop",
      },
    },
    "Check the new-price range and every used figure against current quotes, then photograph one of your own combis."
  ),
  unverified<PostRecord>(
    {
      slug: "nine-checks-before-you-buy-used-equipment",
      image: {
        src: stock("photo-1588416820614-f8d6ac6cea56"),
        alt: "Workshop bench with parts laid out",
      },
    },
    "The advice is yours and sound; confirm the nine checks match what your workshop actually does, then use your own photograph."
  ),
  unverified<PostRecord>(
    {
      slug: "grade-a-b-c-what-the-letters-mean",
      image: {
        src: stock("photo-1696475091592-cd1cab5afdc2"),
        alt: "Graded units on the floor",
      },
    },
    "Must agree exactly with /conditions and with the grades in ops. This one is a promise, not an opinion."
  ),
  unverified<PostRecord>(
    {
      slug: "fitting-out-a-60-seat-kitchen",
      image: {
        src: stock("photo-1708915965975-2a950db0e215"),
        alt: "A fitted-out commercial kitchen line",
      },
    },
    "Every rand figure in the worked example needs checking against real sales. This is the post most likely to be quoted back at you."
  ),
];

// ───────────────────────────────────────────────────────────────────────────
// SUB-PROCESSORS — rendered by /privacy. POPIA requires you say who else
// touches a customer's information, so adding a vendor anywhere in this
// codebase means adding it here, which mechanically changes the notice.
// ───────────────────────────────────────────────────────────────────────────

export const processors: Fact<Processor>[] = [
  {
    value: { name: "Supabase", purpose: "hosts our database" },
    verified: "2026-08-08",
    evidence: "The database this platform runs on. Named in the notice since it was written.",
  },
  {
    value: { name: "Resend", purpose: "sends our email" },
    verified: "2026-08-08",
    evidence: "Marketing and transactional email. Named in the notice since it was written.",
  },
  {
    value: { name: "Vercel", purpose: "hosts this website" },
    verified: "2026-08-08",
    evidence: "Serves every page and therefore handles request data including IP addresses.",
  },
  {
    value: { name: "Cloudflare", purpose: "checks our forms are not being filled in by bots" },
    verified: "2026-08-08",
    evidence: "Turnstile. Sees a token and an IP address at the moment a form is submitted.",
  },
  {
    value: { name: "Sentry", purpose: "tells us when something breaks" },
    verified: "2026-08-08",
    evidence:
      "Error monitoring. Configured with sendDefaultPii false and a beforeSend that strips names, emails and phone numbers before anything leaves.",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// SECURITY posture that has to be true before this is a public website.
// ───────────────────────────────────────────────────────────────────────────

export const security = {
  turnstile: unverified(
    false,
    "Set NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY on both Vercel projects, submit the enquiry form on the deployed site, then set this to true. Without it, production refuses every form submission by design."
  ),
} as const;

// ═══════════════════════════════════════════════════════════════════════════
//  ▼▼▼  FLIP THIS WHEN THE DOMAIN IS ABOUT TO BE POINTED HERE.  ▼▼▼
//
//  "pre-launch" — unverified facts are warnings. You can build and deploy.
//  "live"       — unverified facts fail the build. Nothing can regress.
// ═══════════════════════════════════════════════════════════════════════════

export const launchState: LaunchState = "pre-launch";

// ───────────────────────────────────────────────────────────────────────────
// Helpers. Used by the site to decide what renders, and by
// scripts/check-launch-ready.mjs to decide what fails.
// ───────────────────────────────────────────────────────────────────────────

const sameAsPlaceholder = <T,>(fact: Fact<T>): boolean =>
  fact.placeholder !== undefined &&
  JSON.stringify(fact.value) === JSON.stringify(fact.placeholder);

/**
 * May this be published?
 *
 * Both conditions, always. Checking `verified` alone would let somebody set a
 * date on a fact they never actually edited — which is the exact failure this
 * whole file exists to prevent, so the runtime enforces it too rather than
 * trusting the CI check to have run.
 */
export const isVerified = <T,>(fact: Fact<T>): boolean =>
  fact.verified !== null && !sameAsPlaceholder(fact);

/** The verified ones, in order. */
export const published = <T,>(facts: Fact<T>[]): T[] =>
  facts.filter(isVerified).map((fact) => fact.value);

/** A verified value, or null if it is being withheld. */
export const publishedValue = <T,>(fact: Fact<T>): T | null =>
  isVerified(fact) ? fact.value : null;

/** Does this URL point at a stock-photo CDN rather than at this business? */
export const isPlaceholderMedia = (src: string): boolean =>
  PLACEHOLDER_HOSTS.some((host) => src.includes(host));

/**
 * Is there a Journal to link to?
 *
 * Derived here rather than from posts.ts so the navigation — which lives in
 * client components — can ask the question without pulling every post's prose
 * into the browser bundle to answer it.
 */
export const hasJournal = posts.some(isVerified);

/** Blocking facts, by name, in the order somebody should fill them in. */
export const BLOCKING: Array<[string, Fact<unknown>]> = Object.entries(contact) as Array<
  [string, Fact<unknown>]
>;

/**
 * The gate that cannot be forgotten.
 *
 * Called at module load from site.ts, which every page imports — so a
 * production build carrying an invented phone number does not fail a lint step
 * somebody can skip, it fails to compile.
 *
 * Only in production. Local development and Vercel preview builds run with the
 * mockup values so the site is workable while the real ones are being gathered.
 */
export function assertProductionReady(): void {
  if (process.env.VERCEL_ENV !== "production") return;

  const missing = BLOCKING.filter(([, fact]) => !isVerified(fact)).map(([name]) => name);
  if (missing.length === 0) return;

  throw new Error(
    [
      "",
      "  ┌───────────────────────────────────────────────────────────────────┐",
      "  │  PRODUCTION BUILD REFUSED                                         │",
      "  └───────────────────────────────────────────────────────────────────┘",
      "",
      `  ${missing.length} contact detail${missing.length === 1 ? " is" : "s are"} still the mockup placeholder:`,
      "",
      ...missing.map((name) => `      · ${name}`),
      "",
      "  These appear on every CTA, in the footer, and in the POPIA privacy",
      "  notice. Publishing an invented number is worse than publishing none.",
      "",
      "  Fix them in  apps/web/src/data/launch.ts  — set the real value and",
      "  put today's date in `verified`.",
      "",
      "  Run  npm run check:launch  to see everything else that is waiting.",
      "",
    ].join("\n")
  );
}
