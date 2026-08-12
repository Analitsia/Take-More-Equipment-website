/**
 * Turning a log row into a sentence with a person's name in it.
 *
 * activity_log is written by a SECURITY DEFINER trigger, and its `summary` is
 * deliberately terse and object-first — "TM-0012: refurbishing → listed". That
 * is the right thing for the database to store: it is a fact about a machine,
 * phrased the same way whoever caused it.
 *
 * It is the wrong thing to read on a Team screen, where the question is not
 * "what happened to this fryer" but "who did that". So the phrasing happens
 * here, in the app, from the columns the trigger already writes — actor_id plus
 * before/after — rather than by rewriting the trigger to bake a name into the
 * text. Two reasons that matters:
 *
 *   - the log stays a record of facts, not of prose, and cannot drift out of
 *     date when somebody corrects the spelling of their own name;
 *   - every row already in the table gets the new sentence, including the ones
 *     written months before this screen existed.
 *
 * Everything in this file is pure and client-safe: no Supabase, no server-only
 * import, so the filter UI can render it in the browser.
 */

import {
  rands,
  ROLE_LABELS,
  STATUS_LABELS,
  type AppRole,
  type ItemStatus,
} from "@takemore/core";

/** The shape getRecentActivity() returns. `before`/`after` are jsonb. */
export type ActivityEntry = {
  id: number;
  entity: string;
  entity_id: string;
  action: string;
  summary: string | null;
  before: unknown;
  after: unknown;
  actor_id: string | null;
  created_at: string;
};

export type Person = { name: string; role: AppRole };
/** user_id → who they are, built from the team roster the page already reads. */
export type People = Map<string, Person>;
/**
 * The same roster as a flat list, which is what crosses the client boundary.
 *
 * The Map is rebuilt on the other side. Flight can serialise a Map, but a plain
 * array is the cheaper payload and does not make the props depend on it.
 */
export type PersonRow = Person & { id: string };

/**
 * Names for the two kinds of row that have no person behind them.
 *
 * actor_id is ON DELETE SET NULL against auth.users, so an entry outlives the
 * account that made it — and the scheduled matcher writes rows with no session
 * at all. Both are shown as what they are rather than as a blank, because a
 * timeline with anonymous lines in it teaches people not to trust it.
 */
const FORMER = "A former team member";
const SYSTEM = "The system";

const ACTION_LOOK: Record<string, { icon: string; tone: string }> = {
  created: { icon: "solar:add-square-linear", tone: "text-muted" },
  published: { icon: "solar:global-linear", tone: "text-accent" },
  unpublished: { icon: "solar:eye-closed-linear", tone: "text-muted" },
  status_changed: { icon: "solar:refresh-linear", tone: "text-status-refurbishing" },
  price_changed: { icon: "solar:tag-price-linear", tone: "text-accent" },
  deleted: { icon: "solar:trash-bin-trash-linear", tone: "text-status-sold" },
};

export const lookFor = (action: string) =>
  ACTION_LOOK[action] ?? { icon: "solar:pen-linear", tone: "text-muted" };

/** One key out of a jsonb blob, without trusting it to be an object at all. */
function field(blob: unknown, key: string): unknown {
  return blob && typeof blob === "object"
    ? (blob as Record<string, unknown>)[key]
    : undefined;
}

const asText = (value: unknown) => (typeof value === "string" ? value : undefined);
const asCents = (value: unknown) => (typeof value === "number" ? value : undefined);

/**
 * Which machine this was about.
 *
 * `created` and `deleted` carry the SKU in their payload. The rest do not, but
 * every summary the trigger writes opens with it — so the payload first, the
 * summary's first word as the fallback, and a neutral noun if even that is
 * missing rather than an empty gap in the middle of a sentence.
 */
function skuOf(entry: ActivityEntry): string {
  const carried = asText(field(entry.after, "sku")) ?? asText(field(entry.before, "sku"));
  return carried ?? entry.summary?.match(/^[^\s:]+/)?.[0] ?? "an item";
}

const stage = (value: unknown) => {
  const status = asText(value) as ItemStatus | undefined;
  return status ? (STATUS_LABELS[status] ?? status) : undefined;
};

/** Who did it — a real name where there is one. */
export function whoDid(entry: ActivityEntry, people: People): string {
  if (!entry.actor_id) return SYSTEM;
  return people.get(entry.actor_id)?.name ?? FORMER;
}

/** "Owner", "Manager" — the second line, next to the time. Null for non-people. */
export function roleOf(entry: ActivityEntry, people: People): string | null {
  const role = entry.actor_id ? people.get(entry.actor_id)?.role : undefined;
  return role ? ROLE_LABELS[role] : null;
}

/**
 * The line somebody actually reads: a person, a verb, and the machine.
 *
 * Written from the doer's side on purpose — "Sipho dropped TM-0012 from R42 000
 * to R38 500" answers who and what in one pass, where the stored summary plus a
 * name underneath it needs two.
 *
 * Prices here are the list price, which is on the public website; nothing in
 * this file reaches cost or margin, which is what keeps the whole timeline
 * readable by staff rather than managers only.
 */
export function phraseFor(entry: ActivityEntry, people: People): string {
  const who = whoDid(entry, people);

  // Anything that is not an item is something added after this was written.
  // Fall back to the stored wording rather than inventing a sentence for it.
  if (entry.entity !== "item") {
    return entry.summary ? `${who} — ${entry.summary}` : `${who} made a change`;
  }

  const sku = skuOf(entry);

  switch (entry.action) {
    case "created":
      return `${who} added ${sku}`;

    case "deleted":
      return `${who} deleted ${sku}`;

    case "published":
      return `${who} put ${sku} on the website`;

    case "unpublished":
      return `${who} took ${sku} off the website`;

    case "status_changed": {
      const from = stage(field(entry.before, "status"));
      const to = stage(field(entry.after, "status"));
      if (from && to) return `${who} moved ${sku} from ${from} to ${to}`;
      if (to) return `${who} moved ${sku} to ${to}`;
      return `${who} moved ${sku}`;
    }

    case "price_changed": {
      const was = asCents(field(entry.before, "list_price_cents"));
      const now = asCents(field(entry.after, "list_price_cents"));
      if (now == null) return `${who} cleared the price on ${sku}`;
      if (was == null) return `${who} priced ${sku} at ${rands(now)}`;
      const verb = now < was ? "dropped" : "raised";
      return `${who} ${verb} ${sku} from ${rands(was)} to ${rands(now)}`;
    }

    default:
      return entry.summary ? `${who} — ${entry.summary}` : `${who} changed ${sku}`;
  }
}

/** "4 min ago" beats a timestamp for anything that happened today. */
export function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/** Group by calendar day, so a scroll has landmarks in it. */
export function dayOf(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return "Today";
  if (same(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
}
