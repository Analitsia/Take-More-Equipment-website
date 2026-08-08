import { rands, type OutreachChannel } from "@takemore/core";

/**
 * The draft a staff member sends.
 *
 * Written here rather than in SQL deliberately. The matcher decides WHO should
 * hear about a machine — that is a rule, and rules live in Postgres where they
 * cannot be forgotten. What to SAY is a different kind of decision: it depends
 * on the storefront's URL, on how this business talks, and on whether the person
 * sending it wants to change a word before they do. None of that belongs in a
 * trigger.
 *
 * Three things every message must do, in this order:
 *   1. Use their name.
 *   2. Say what THEY told us they wanted, in their words where we have them.
 *      This is the whole difference between "we remembered you" and a blast.
 *   3. Give them the machine and a link, and then stop.
 *
 * No photos are attached. On WhatsApp the link preview renders the item's own
 * OG image — which the storefront already generates from its first photo — so
 * the picture arrives without a 4 MB upload through somebody's phone data. On
 * email the template embeds it properly.
 */

export type MatchContext = {
  leadName: string | null;
  /** What they said they were looking for, in their own words. May be empty. */
  want: string | null;
  /** The category or subcategory they asked for, as a fallback for `want`. */
  wantCategory: string | null;
  itemTitle: string;
  itemBrand: string | null;
  itemSlug: string;
  itemPriceCents: number | null;
  itemGrade: "A" | "B" | "C" | null;
};

const firstName = (full: string | null): string => {
  const name = (full ?? "").trim().split(/\s+/)[0];
  return name || "there";
};

export const itemUrl = (slug: string): string => {
  const base =
    process.env.NEXT_PUBLIC_STOREFRONT_URL ??
    process.env.STOREFRONT_URL ??
    "https://takemoreequipment.co.za";
  return `${base.replace(/\/$/, "")}/stock/${slug}`;
};

/**
 * The reminder clause — the sentence that proves this is not a blast.
 *
 * Their own words win over the category every time. "you were after something
 * to keep drinks cold for the shop" lands; "you were interested in
 * Refrigeration" reads like a database, because it is one.
 */
const because = (context: MatchContext): string => {
  const want = context.want?.trim();
  if (want) {
    const trimmed = want.length > 90 ? `${want.slice(0, 87).trimEnd()}…` : want;
    return `you told us you were after ${trimmed.replace(/\.$/, "")}`;
  }
  if (context.wantCategory) return `you were looking for ${context.wantCategory.toLowerCase()}`;
  return "you were looking for equipment";
};

const describe = (context: MatchContext): string =>
  [context.itemBrand, context.itemTitle].filter(Boolean).join(" ");

export function draftMatchMessage(
  context: MatchContext,
  channel: OutreachChannel
): string {
  const price = context.itemPriceCents ? rands(context.itemPriceCents) : null;
  const grade = context.itemGrade ? `Grade ${context.itemGrade}` : null;
  const spec = [price, grade].filter(Boolean).join(", ");

  if (channel === "whatsapp") {
    // Short. A WhatsApp message that needs a "read more" tap gets neither.
    return [
      `Hi ${firstName(context.leadName)}, it's Take More.`,
      "",
      `A while back ${because(context)} — one has just come through the workshop.`,
      "",
      `${describe(context)}${spec ? ` — ${spec}` : ""}`,
      itemUrl(context.itemSlug),
      "",
      "Happy to hold it while you come and look at it. Still one of one, so it will not sit long.",
    ].join("\n");
  }

  return [
    `Hi ${firstName(context.leadName)},`,
    "",
    `A while back ${because(context)}. One has just come through the workshop and is on the site now.`,
    "",
    `${describe(context)}${spec ? ` — ${spec}` : ""}`,
    itemUrl(context.itemSlug),
    "",
    "Everything we list is stripped, tested and graded before it goes up, and you are welcome to come and watch it run in Montague Gardens before you pay anything.",
    "",
    "Reply to this and we will hold it for you.",
    "",
    "— Take More Catering Equipment",
  ].join("\n");
}

/** wa.me with the draft pre-filled. The staff member is the sender. */
export const whatsappSendLink = (digits: string, body: string): string =>
  `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
