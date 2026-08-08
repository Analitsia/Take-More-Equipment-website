/**
 * What an item needs before it is allowed on the public site.
 *
 * `status` and `published_at` are independent by design — that is what lets a
 * sold machine stay listed with a SOLD badge until a human takes it down — so
 * publishing is its own deliberate action with its own gate. Without this the
 * first item to go live is a title, no photo and a blank price block.
 *
 * The database enforces the same rule in a trigger. This copy is what draws the
 * checklist in the ops app, so a worker sees what is missing before they tap.
 */

import type { Cents } from "./money.ts";

export type PublishCandidate = {
  title: string | null;
  description: string | null;
  categoryId: string | null;
  grade: string | null;
  listPriceCents: Cents | null;
  photoCount: number;
  /**
   * What the machine cost us — and null when the viewer is not allowed to know.
   *
   * A `staff` account is refused the cost rows by RLS, so for them these two
   * requirements are OMITTED rather than drawn as permanently unmet: a checklist
   * item nobody can satisfy or even verify is a dead end, not a rule.
   *
   * DELIBERATE DIVERGENCE from the database trigger, which does not check either
   * of these. Everything else in this file is mirrored in SQL; these two are
   * enforced in the app alone, because failing a publish on figures the caller
   * cannot read produces an error they have no way to diagnose. If this ever
   * needs to be absolute, it belongs in the trigger — where it can read the
   * ledger under SECURITY DEFINER — and not here.
   */
  costs?: {
    auctionCents: Cents | null;
    workshopCents: Cents | null;
  } | null;
};

export type PublishRequirement = {
  id: string;
  label: string;
  met: boolean;
};

export function publishChecklist(item: PublishCandidate): PublishRequirement[] {
  const costs = item.costs
    ? [
        {
          id: "auction-cost",
          label: "An auction price",
          met: item.costs.auctionCents !== null && item.costs.auctionCents > 0,
        },
        {
          id: "workshop-cost",
          label: "A workshop cost",
          met: item.costs.workshopCents !== null && item.costs.workshopCents > 0,
        },
      ]
    : [];

  return [
    {
      id: "photo",
      label: "At least one photo",
      met: item.photoCount > 0,
    },
    {
      id: "title",
      label: "A title",
      met: !!item.title && item.title.trim().length > 2,
    },
    {
      id: "category",
      label: "A category",
      met: !!item.categoryId,
    },
    {
      id: "grade",
      label: "A condition grade",
      met: !!item.grade,
    },
    {
      id: "price",
      label: "An asking price",
      met: item.listPriceCents !== null && item.listPriceCents > 0,
    },
    {
      id: "description",
      // The house style runs to roughly four hundred characters. Forty is not
      // that standard — it is the floor below which the detail page has a
      // visibly empty column.
      label: "A description",
      met: !!item.description && item.description.trim().length >= 40,
    },
    ...costs,
  ];
}

export const canPublish = (item: PublishCandidate) =>
  publishChecklist(item).every((requirement) => requirement.met);

export const missingForPublish = (item: PublishCandidate) =>
  publishChecklist(item).filter((requirement) => !requirement.met);
