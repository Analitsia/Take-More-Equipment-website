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
};

/**
 * WHAT IS DELIBERATELY NOT HERE: the auction price and the workshop cost.
 *
 * They are marked required on the intake form, because every machine has both
 * and a blank one is usually an oversight. They are not a publish requirement,
 * and the difference matters.
 *
 * This gate exists to stop a machine reaching the WEBSITE half-built — no photo,
 * no price, no description. Internal bookkeeping is a different question, and
 * gating the storefront on it produces a trap: take a listing down to fix a typo
 * and you cannot put it back until somebody fills in what it cost, which may be
 * a figure the person standing there is not even allowed to read.
 *
 * It also made the gate disagree with itself — a staff account cannot see cost
 * rows, so the same item was publishable by them and blocked for their manager.
 */

export type PublishRequirement = {
  id: string;
  label: string;
  met: boolean;
};

export function publishChecklist(item: PublishCandidate): PublishRequirement[] {
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
  ];
}

export const canPublish = (item: PublishCandidate) =>
  publishChecklist(item).every((requirement) => requirement.met);

export const missingForPublish = (item: PublishCandidate) =>
  publishChecklist(item).filter((requirement) => !requirement.met);
