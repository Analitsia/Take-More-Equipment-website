import type { ItemStatus } from "@takemore/core";

/**
 * Every number on the Dashboard is computed here.
 *
 * Pure functions over plain rows, deliberately: the page fetches once, the
 * browser re-runs these on every filter change, and none of it can disagree
 * with itself because there is exactly one implementation of each metric.
 *
 * ── The one rule the whole page obeys ─────────────────────────────────────
 *
 * The filter bar scopes EVERYTHING, with one stated exception: stock on hand is
 * always "right now". A machine standing in the workshop is standing there
 * today regardless of which period is selected, and pretending otherwise
 * produces the classic dashboard lie — "R0 tied up" because nothing arrived in
 * the last thirty days. Functions below say which side they are on, and the UI
 * labels the exception where it appears.
 *
 * Realised things (revenue, margin, units sold, days-to-sale) are scoped by
 * WHEN THEY SOLD. Cost is scoped by when the machine ARRIVED, because that is
 * when the money left — scoping a workshop bill by a sale that has not happened
 * yet would hide every cent spent on stock still on the floor.
 */

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * PostgREST returns `bigint` as a STRING, not a number.
 *
 * Every money column in item_analytics is a bigint, so without this pass
 * `a.cost_cents + b.cost_cents` silently concatenates two strings and the
 * dashboard reports a margin of "210000170000". The existing Money page dodged
 * it by wrapping every single read in Number(); normalising once at the door is
 * the version that cannot be forgotten at a call site.
 */
const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export type ItemRow = {
  item_id: string;
  sku: string;
  title: string;
  status: ItemStatus;
  arrived_at: string;
  sold_at: string | null;
  created_at: string;
  published_at: string | null;
  category_id: string | null;
  category: string;
  subcategory_id: string | null;
  subcategory: string;
  is_sold: boolean;
  price_cents: number;
  revenue_cents: number;
  cost_cents: number;
  cost_auction_cents: number;
  cost_workshop_cents: number;
  cost_delivery_cents: number;
  cost_parts_cents: number;
  cost_labour_cents: number;
  cost_premium_cents: number;
  cost_other_cents: number;
  labour_hours: number;
  margin_cents: number;
  unrealised_margin_cents: number;
  tied_up_cents: number;
  days_to_sale: number | null;
  days_on_shelf: number | null;
};

export type LeadRow = {
  lead_id: string;
  interest_id: string | null;
  category_id: string | null;
  category: string | null;
  subcategory_id: string | null;
  subcategory: string | null;
  budget_max_cents: number | null;
  lead_status: string;
  lead_source: string;
  lead_created_at: string;
  last_contacted_at: string | null;
  is_customer: boolean;
  contactable: boolean;
  unsubscribed: boolean;
};

export const normaliseItem = (raw: Record<string, unknown>): ItemRow => ({
  item_id: String(raw.item_id),
  sku: String(raw.sku ?? ""),
  title: String(raw.title ?? "Untitled item"),
  status: raw.status as ItemStatus,
  arrived_at: String(raw.arrived_at),
  sold_at: (raw.sold_at as string | null) ?? null,
  created_at: String(raw.created_at),
  published_at: (raw.published_at as string | null) ?? null,
  category_id: (raw.category_id as string | null) ?? null,
  category: String(raw.category ?? "Uncategorised"),
  subcategory_id: (raw.subcategory_id as string | null) ?? null,
  subcategory: String(raw.subcategory ?? "Unspecified"),
  is_sold: Boolean(raw.is_sold),
  price_cents: num(raw.price_cents),
  revenue_cents: num(raw.revenue_cents),
  cost_cents: num(raw.cost_cents),
  cost_auction_cents: num(raw.cost_auction_cents),
  cost_workshop_cents: num(raw.cost_workshop_cents),
  cost_delivery_cents: num(raw.cost_delivery_cents),
  cost_parts_cents: num(raw.cost_parts_cents),
  cost_labour_cents: num(raw.cost_labour_cents),
  cost_premium_cents: num(raw.cost_premium_cents),
  cost_other_cents: num(raw.cost_other_cents),
  labour_hours: num(raw.labour_hours),
  margin_cents: num(raw.margin_cents),
  unrealised_margin_cents: num(raw.unrealised_margin_cents),
  tied_up_cents: num(raw.tied_up_cents),
  days_to_sale: numOrNull(raw.days_to_sale),
  days_on_shelf: numOrNull(raw.days_on_shelf),
});

export const normaliseLead = (raw: Record<string, unknown>): LeadRow => ({
  lead_id: String(raw.lead_id),
  interest_id: (raw.interest_id as string | null) ?? null,
  category_id: (raw.category_id as string | null) ?? null,
  category: (raw.category as string | null) ?? null,
  subcategory_id: (raw.subcategory_id as string | null) ?? null,
  subcategory: (raw.subcategory as string | null) ?? null,
  budget_max_cents: numOrNull(raw.budget_max_cents),
  lead_status: String(raw.lead_status ?? "new"),
  lead_source: String(raw.lead_source ?? "walk_in"),
  lead_created_at: String(raw.lead_created_at),
  last_contacted_at: (raw.last_contacted_at as string | null) ?? null,
  is_customer: Boolean(raw.is_customer),
  contactable: Boolean(raw.contactable),
  unsubscribed: Boolean(raw.unsubscribed),
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** `days: null` means all of history. */
export type Filters = {
  categoryId: string | null;
  subcategoryId: string | null;
  days: number | null;
};

export const PERIODS: { days: number | null; label: string }[] = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
  { days: null, label: "All time" },
];

const cutoff = (days: number | null): number | null =>
  days === null ? null : Date.now() - days * 86_400_000;

const within = (iso: string | null, from: number | null): boolean => {
  if (!iso) return false;
  if (from === null) return true;
  return new Date(iso).getTime() >= from;
};

/** Category and subcategory only. Period is applied per-metric, not here. */
export function inScope(row: ItemRow, filters: Filters): boolean {
  if (filters.categoryId && row.category_id !== filters.categoryId) return false;
  if (filters.subcategoryId && row.subcategory_id !== filters.subcategoryId) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The tile strip
// ---------------------------------------------------------------------------

export type Summary = {
  /** Sold within the period. */
  unitsSold: number;
  revenueCents: number;
  marginCents: number;
  /** Null rather than 0 when nothing sold — 0% margin is a claim, absence is not. */
  marginPercent: number | null;
  avgDaysToSale: number | null;

  /** Right now, whatever the period. */
  unitsOnHand: number;
  tiedUpCents: number;
  unrealisedMarginCents: number;
  avgDaysOnShelf: number | null;
  agedUnits: number;
  agedCents: number;

  /**
   * Of everything that could have left in this period, what did.
   * Sold ÷ (sold + still standing). Not a cohort rate — a cohort rate needs
   * arrival dates to line up with sale dates and would report nothing at all
   * for a business that turns stock over in ninety days.
   */
  sellThroughPercent: number | null;

  /** Spent on the machines taken in during the period. */
  costCents: number;
  unitsTakenIn: number;
};

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

const round1 = (n: number | null): number | null =>
  n === null ? null : Math.round(n * 10) / 10;

export function summarise(rows: ItemRow[], filters: Filters): Summary {
  const from = cutoff(filters.days);
  const scoped = rows.filter((row) => inScope(row, filters));

  const sold = scoped.filter((row) => row.is_sold && within(row.sold_at, from));
  const onHand = scoped.filter((row) => !row.is_sold);
  const takenIn = scoped.filter((row) => within(row.arrived_at, from));

  const revenueCents = sold.reduce((sum, row) => sum + row.revenue_cents, 0);
  const marginCents = sold.reduce((sum, row) => sum + row.margin_cents, 0);
  const aged = onHand.filter((row) => (row.days_on_shelf ?? 0) > 90);

  return {
    unitsSold: sold.length,
    revenueCents,
    marginCents,
    marginPercent:
      revenueCents > 0 ? round1((marginCents / revenueCents) * 100) : null,
    avgDaysToSale: round1(
      mean(sold.map((row) => row.days_to_sale).filter((d): d is number => d !== null))
    ),

    unitsOnHand: onHand.length,
    tiedUpCents: onHand.reduce((sum, row) => sum + row.tied_up_cents, 0),
    unrealisedMarginCents: onHand.reduce(
      (sum, row) => sum + row.unrealised_margin_cents,
      0
    ),
    avgDaysOnShelf: round1(
      mean(onHand.map((row) => row.days_on_shelf).filter((d): d is number => d !== null))
    ),
    agedUnits: aged.length,
    agedCents: aged.reduce((sum, row) => sum + row.tied_up_cents, 0),

    sellThroughPercent:
      sold.length + onHand.length > 0
        ? round1((sold.length / (sold.length + onHand.length)) * 100)
        : null,

    costCents: takenIn.reduce((sum, row) => sum + row.cost_cents, 0),
    unitsTakenIn: takenIn.length,
  };
}

// ---------------------------------------------------------------------------
// The breakdown — by category, or by subcategory once a category is chosen
// ---------------------------------------------------------------------------

export type GroupRow = {
  key: string;
  label: string;
  unitsSold: number;
  unitsOnHand: number;
  marginCents: number;
  revenueCents: number;
  costCents: number;
  tiedUpCents: number;
  avgDaysToSale: number | null;
  avgDaysOnShelf: number | null;
  sellThroughPercent: number | null;
};

/**
 * Which level to group at.
 *
 * Picking a category switches the breakdown to its subcategories, so the same
 * chart is both the overview and the drill-down and there is only ever one
 * chart to read.
 */
export const groupLevel = (filters: Filters): "category" | "subcategory" =>
  filters.categoryId ? "subcategory" : "category";

export function group(rows: ItemRow[], filters: Filters): GroupRow[] {
  const from = cutoff(filters.days);
  const level = groupLevel(filters);
  const scoped = rows.filter((row) => inScope(row, filters));

  const buckets = new Map<string, ItemRow[]>();
  for (const row of scoped) {
    // The label is the key. Both are non-null by construction in the view
    // (coalesced to 'Uncategorised' / 'Unspecified'), which is what lets an
    // uncategorised machine appear as its own bar rather than vanishing.
    const label = level === "category" ? row.category : row.subcategory;
    const list = buckets.get(label);
    if (list) list.push(row);
    else buckets.set(label, [row]);
  }

  return [...buckets.entries()]
    .map(([label, items]) => {
      const sold = items.filter((row) => row.is_sold && within(row.sold_at, from));
      const onHand = items.filter((row) => !row.is_sold);
      const takenIn = items.filter((row) => within(row.arrived_at, from));

      return {
        key: label,
        label,
        unitsSold: sold.length,
        unitsOnHand: onHand.length,
        marginCents: sold.reduce((sum, row) => sum + row.margin_cents, 0),
        revenueCents: sold.reduce((sum, row) => sum + row.revenue_cents, 0),
        costCents: takenIn.reduce((sum, row) => sum + row.cost_cents, 0),
        tiedUpCents: onHand.reduce((sum, row) => sum + row.tied_up_cents, 0),
        avgDaysToSale: round1(
          mean(sold.map((r) => r.days_to_sale).filter((d): d is number => d !== null))
        ),
        avgDaysOnShelf: round1(
          mean(onHand.map((r) => r.days_on_shelf).filter((d): d is number => d !== null))
        ),
        sellThroughPercent:
          sold.length + onHand.length > 0
            ? round1((sold.length / (sold.length + onHand.length)) * 100)
            : null,
      };
    })
    // A group with nothing sold and nothing standing is a category that exists
    // in the catalogue and has never held stock. It is not a data point.
    .filter((row) => row.unitsSold > 0 || row.unitsOnHand > 0);
}

/** Which number the breakdown chart is currently drawing. */
export type Metric = "margin" | "rotation" | "cost" | "units";

export const METRICS: { id: Metric; label: string; caption: string }[] = [
  {
    id: "margin",
    label: "Margin",
    caption: "What was left after everything the workshop spent, on what sold.",
  },
  {
    id: "rotation",
    label: "Rotation",
    caption: "Average days from arriving in the yard to leaving it sold. Lower is better.",
  },
  {
    id: "cost",
    label: "Cost",
    caption: "What was spent taking these machines in and getting them ready.",
  },
  { id: "units", label: "Units", caption: "How many sold, and how many are still standing." },
];

// ---------------------------------------------------------------------------
// Where the money goes
// ---------------------------------------------------------------------------

export type CostRow = { key: string; label: string; totalCents: number; perUnitCents: number };

/**
 * Scoped by ARRIVAL, not by sale, and the caption on the chart says so.
 *
 * A workshop bill is spent the month the machine comes in. Attributing it to
 * the month it eventually sells would report R0 spent on a floor full of stock
 * that has cost real money — which is the number somebody would act on.
 */
export function costs(rows: ItemRow[], filters: Filters): CostRow[] {
  const from = cutoff(filters.days);
  const scoped = rows
    .filter((row) => inScope(row, filters))
    .filter((row) => within(row.arrived_at, from));

  if (scoped.length === 0) return [];

  const kinds: [string, string, (row: ItemRow) => number][] = [
    ["auction", "Auction", (r) => r.cost_auction_cents],
    ["workshop", "Workshop", (r) => r.cost_workshop_cents],
    ["delivery", "Delivery", (r) => r.cost_delivery_cents],
    ["parts", "Parts", (r) => r.cost_parts_cents],
    ["labour", "Labour", (r) => r.cost_labour_cents],
    ["premium", "Buyer's premium", (r) => r.cost_premium_cents],
    ["other", "Other", (r) => r.cost_other_cents],
  ];

  return kinds
    .map(([key, label, pick]) => {
      const totalCents = scoped.reduce((sum, row) => sum + pick(row), 0);
      // Averaged over machines that actually carry this kind of cost. Dividing
      // by the whole fleet would report an "average workshop cost" that no
      // machine has ever had, and that shrinks every time a unit arrives with
      // nothing spent on it yet.
      const charged = scoped.filter((row) => pick(row) > 0).length;
      return {
        key,
        label,
        totalCents,
        perUnitCents: charged > 0 ? Math.round(totalCents / charged) : 0,
      };
    })
    .filter((row) => row.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents);
}

// ---------------------------------------------------------------------------
// The trend
// ---------------------------------------------------------------------------

export type MonthRow = {
  month: string;
  unitsSold: number;
  revenueCents: number;
  marginCents: number;
  marginPercent: number | null;
  avgDaysToSale: number | null;
};

const monthKey = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Months with no sales are emitted as empty bars rather than skipped.
 *
 * A categorical axis that jumps March → July draws a flat, healthy-looking
 * trend across the two months nothing sold. The gap is the finding.
 */
export function byMonth(rows: ItemRow[], filters: Filters): MonthRow[] {
  const from = cutoff(filters.days);
  const sold = rows
    .filter((row) => inScope(row, filters))
    .filter((row) => row.is_sold && within(row.sold_at, from));

  if (sold.length === 0) return [];

  const buckets = new Map<string, ItemRow[]>();
  for (const row of sold) {
    const key = monthKey(row.sold_at!);
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }

  const keys = [...buckets.keys()].sort();
  const [firstYear, firstMonth] = keys[0].split("-").map(Number);
  const [lastYear, lastMonth] = keys[keys.length - 1].split("-").map(Number);

  const out: MonthRow[] = [];
  const cursor = new Date(firstYear, firstMonth - 1, 1);
  const end = new Date(lastYear, lastMonth - 1, 1);

  // Capped at 24 bars. Beyond that they are too thin to read on the phone this
  // is opened on, and the tile strip already carries the period total.
  while (cursor <= end && out.length < 240) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const items = buckets.get(key) ?? [];
    const revenueCents = items.reduce((sum, row) => sum + row.revenue_cents, 0);
    const marginCents = items.reduce((sum, row) => sum + row.margin_cents, 0);

    out.push({
      month: key,
      unitsSold: items.length,
      revenueCents,
      marginCents,
      marginPercent: revenueCents > 0 ? round1((marginCents / revenueCents) * 100) : null,
      avgDaysToSale: round1(
        mean(items.map((r) => r.days_to_sale).filter((d): d is number => d !== null))
      ),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return out.slice(-24);
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export type CrmSummary = {
  /** People, not wants. A lead with three interests is one person. */
  clients: number;
  newInPeriod: number;
  customers: number;
  conversionPercent: number | null;
  contactable: number;
  /** Wants on record that nothing has been sold against yet. */
  openWants: number;
};

const distinct = (rows: LeadRow[]): number => new Set(rows.map((r) => r.lead_id)).size;

/**
 * The category filter genuinely narrows the client base here, and that is the
 * point: with Refrigeration selected, "clients" means the people who have asked
 * for refrigeration. A lead with no want recorded carries a null category and
 * therefore drops out of a filtered view — correct, and the reason the unfiltered
 * count is larger than the sum of the filtered ones.
 */
function scopeLeads(rows: LeadRow[], filters: Filters): LeadRow[] {
  if (!filters.categoryId && !filters.subcategoryId) return rows;
  return rows.filter((row) => {
    if (filters.categoryId && row.category_id !== filters.categoryId) return false;
    if (filters.subcategoryId && row.subcategory_id !== filters.subcategoryId) return false;
    return true;
  });
}

export function summariseCrm(rows: LeadRow[], filters: Filters): CrmSummary {
  const from = cutoff(filters.days);
  const scoped = scopeLeads(rows, filters);

  const clients = distinct(scoped);
  const customers = distinct(scoped.filter((row) => row.is_customer));

  return {
    clients,
    newInPeriod: distinct(scoped.filter((row) => within(row.lead_created_at, from))),
    customers,
    conversionPercent: clients > 0 ? round1((customers / clients) * 100) : null,
    contactable: distinct(scoped.filter((row) => row.contactable)),
    openWants: scoped.filter((row) => row.interest_id !== null).length,
  };
}

export type DemandRow = { key: string; label: string; clients: number; customers: number };

/**
 * Demand by category — or by subcategory once a category is picked, mirroring
 * the stock breakdown so both charts drill together.
 *
 * Rows with no category are dropped rather than bucketed as "Unspecified": a
 * customer whose want has not been written down yet is not evidence of demand
 * for anything, and showing them as a bar would invent a signal.
 */
export function demand(rows: LeadRow[], filters: Filters): DemandRow[] {
  const level = groupLevel(filters);
  const scoped = scopeLeads(rows, filters).filter((row) =>
    level === "category" ? row.category !== null : row.subcategory !== null
  );

  const buckets = new Map<string, LeadRow[]>();
  for (const row of scoped) {
    const label = (level === "category" ? row.category : row.subcategory)!;
    const list = buckets.get(label);
    if (list) list.push(row);
    else buckets.set(label, [row]);
  }

  return [...buckets.entries()]
    .map(([label, leads]) => ({
      key: label,
      label,
      clients: distinct(leads),
      customers: distinct(leads.filter((row) => row.is_customer)),
    }))
    .sort((a, b) => b.clients - a.clients);
}
