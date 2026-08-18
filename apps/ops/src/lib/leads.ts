import { supabase } from "./supabase";
import { reportError } from "@takemore/observability";
import type {
  LeadEventKind,
  LeadSource,
  LeadStatus,
  OutreachChannel,
  OutreachState,
} from "@takemore/core";
import { coverImage, type MediaRef } from "./media";

/**
 * Reads for the CRM.
 *
 * Same shape as lib/queries.ts: everything goes through the staff client, so
 * RLS decides what comes back. Unlike costs, every approved staff member can
 * read every lead — the person at the counter is usually not a manager, and a
 * customer record they cannot open is one nobody will use.
 *
 * Lists are fetched whole and filtered in the browser, matching ItemsBrowser.
 * At a few thousand leads that is a single small query and instant typing; the
 * day it stops being true, the fix is a Postgres full-text search on the same
 * columns, not a redesign.
 */

export type LeadInterestRow = {
  id: string;
  category_id: string | null;
  subcategory_id: string | null;
  item_id: string | null;
  budget_max_cents: number | null;
  min_grade: "A" | "B" | "C" | null;
  description: string;
  active: boolean;
  created_at: string;
  category: { name: string } | null;
  subcategory: { name: string } | null;
  item: { title: string; slug: string } | null;
  tags: { tag_id: string }[];
};

export type LeadRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  phone_e164: string | null;
  birthday: string | null;
  business_name: string | null;
  source: LeadSource;
  status: LeadStatus;
  notes: string | null;
  email_consent_at: string | null;
  whatsapp_consent_at: string | null;
  consent_source: string | null;
  unsubscribed_at: string | null;
  unsubscribe_token: string;
  last_contacted_at: string | null;
  created_at: string;
  interests: LeadInterestRow[];
};

/**
 * `item:items` has to name its foreign key.
 *
 * lead_interests points at items TWICE — `item_id` (the machine they enquired
 * about) and `fulfilled_by_item_id` (the one that eventually satisfied them) —
 * so an unqualified embed is ambiguous and PostgREST refuses the whole query
 * rather than guessing. Naming the constraint is the documented way to say
 * which one, and it fails loudly if the constraint is ever renamed, which is
 * the behaviour you want from a join you cannot see.
 */
const INTEREST_SELECT = `
  id, category_id, subcategory_id, item_id, budget_max_cents, min_grade,
  description, active, created_at,
  category:categories(name),
  subcategory:subcategories(name),
  item:items!lead_interests_item_id_fkey(title, slug),
  tags:lead_interest_tags(tag_id)
`;

const LEAD_SELECT = `
  id, full_name, email, phone, phone_e164, birthday, business_name,
  source, status, notes,
  email_consent_at, whatsapp_consent_at, consent_source, unsubscribed_at,
  unsubscribe_token, last_contacted_at, created_at,
  interests:lead_interests(${INTEREST_SELECT})
`;

export async function listLeads(): Promise<LeadRow[]> {
  const client = await supabase();
  const { data, error } = await client
    .from("leads")
    .select(LEAD_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LeadRow[];
}

export async function getLead(id: string): Promise<LeadRow | null> {
  const client = await supabase();
  const { data, error } = await client
    .from("leads")
    .select(LEAD_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as LeadRow | null;
}

export type LeadEventRow = {
  id: string;
  kind: LeadEventKind;
  body: string | null;
  created_at: string;
  item: { title: string; slug: string } | null;
  actor: { full_name: string } | null;
};

export async function getLeadEvents(leadId: string): Promise<LeadEventRow[]> {
  const client = await supabase();
  const { data, error } = await client
    .from("lead_events")
    .select(
      `id, kind, body, created_at,
       item:items(title, slug),
       actor:staff_profiles(full_name)`
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LeadEventRow[];
}

export type QueuedMessage = {
  id: string;
  channel: OutreachChannel;
  state: OutreachState;
  reason: string | null;
  body: string | null;
  match_score: number | null;
  created_at: string;
  /** When it actually went. Null for anything still queued. */
  sent_at: string | null;
  lead: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    phone_e164: string | null;
  } | null;
  /**
   * The want this suggestion answers.
   *
   * Null only for a row written before outreach_messages had the column, or one
   * whose interest has since been deleted. Everything downstream falls back to
   * the reason string when it is missing rather than refusing to draft.
   */
  interest: {
    id: string;
    description: string;
    category: { name: string } | null;
    subcategory: { name: string } | null;
  } | null;
  item: {
    id: string;
    title: string;
    brand: string | null;
    slug: string;
    list_price_cents: number | null;
    condition_grade: "A" | "B" | "C" | null;
    media: MediaRef[];
  } | null;
};

/**
 * Every column both outreach reads need, written once.
 *
 * Shared so "sent" and "queued" cannot drift into rendering different things —
 * the sent list re-uses the queue's card, and a column missing from one of them
 * would surface as a blank draft rather than as an error.
 */
const OUTREACH_SELECT = `
  id, channel, state, reason, body, match_score, created_at, sent_at,
  lead:leads(id, full_name, email, phone, phone_e164),
  interest:lead_interests(id, description,
                          category:categories(name),
                          subcategory:subcategories(name)),
  item:items(id, title, brand, slug, list_price_cents, condition_grade,
             media:item_media(kind, storage_path, external_url, position,
                              duration_seconds))
`;

/** The review queue: everything waiting for a human to send or dismiss. */
export async function getQueuedOutreach(): Promise<QueuedMessage[]> {
  const client = await supabase();
  const { data, error } = await client
    .from("outreach_messages")
    .select(
      OUTREACH_SELECT
    )
    .eq("state", "queued")
    .order("match_score", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as QueuedMessage[];
}

/**
 * What has already gone out, most recent first.
 *
 * A sent suggestion used to leave the screen entirely, which made the one thing
 * this channel cannot do — confirm delivery — impossible to recover from. The
 * app records "sent" the moment WhatsApp opens, because that is the last event
 * it can observe; whether the staff member then pressed send in WhatsApp, or
 * closed the tab, or lost signal, is not knowable from here. So the row has to
 * stay reachable and re-sendable, and this is the read that keeps it so.
 *
 * `item_id not null` drops the newsletter rows. They are sent messages too, but
 * they belong to a campaign rather than to one machine and one want, and they
 * have their own screen.
 */
export async function getSentOutreach(): Promise<QueuedMessage[]> {
  const client = await supabase();
  const { data, error } = await client
    .from("outreach_messages")
    .select(
      OUTREACH_SELECT
    )
    .eq("state", "sent")
    .not("item_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as QueuedMessage[];
}

/** Just the count, for the nav badge. `head: true` fetches no rows at all. */
export async function countQueuedOutreach(): Promise<number> {
  const client = await supabase();
  const { count } = await client
    .from("outreach_messages")
    .select("id", { count: "exact", head: true })
    .eq("state", "queued");
  return count ?? 0;
}

export type WantingLead = {
  lead_id: string;
  /** Which of their wants this score came from, so an email can quote it. */
  interest_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  description: string;
  score: number;
  /** Whether an unsolicited email is allowed — consent, address, no opt-out. */
  can_email: boolean;
};

/**
 * Who wants this machine, for the panel on an item's page.
 *
 * Deliberately looser than the matcher — no consent filter, no frequency cap.
 * The matcher answers "who may we message unprompted"; this answers "who did we
 * promise to keep an eye out for", and a customer who never ticked a marketing
 * box is still someone to phone.
 */
export async function getLeadsWantingItem(itemId: string): Promise<WantingLead[]> {
  const client = await supabase();
  const { data, error } = await client.rpc("leads_wanting_item", { p_item_id: itemId });
  if (error) {
    // A missing panel is survivable; a 500 on the item editor is not.
    reportError(error, { where: "ops/getLeadsWantingItem", itemId });
    return [];
  }
  return (data ?? []) as WantingLead[];
}

export type MatchingItem = {
  item_id: string;
  title: string;
  brand: string | null;
  slug: string;
  list_price_cents: number | null;
  condition_grade: "A" | "B" | "C" | null;
  score: number;
  /** We have already queued, sent or deliberately skipped this pairing. */
  already_told: boolean;
  /** Filled in by getStockForWants(), not by the RPC. */
  image: string | null;
};

/**
 * What we have in stock for one recorded want.
 *
 * The mirror of getLeadsWantingItem(): that one is read while pricing a machine
 * and asks "who wanted one of these"; this one is read while looking at a
 * person and asks "what have we got for them". Both are needed, because the two
 * moments are different — a delivery arriving, and a customer on the phone.
 */
export async function getStockMatchingInterest(interestId: string): Promise<MatchingItem[]> {
  const client = await supabase();
  const { data, error } = await client.rpc("stock_matching_interest", {
    p_interest_id: interestId,
  });

  if (error) {
    // A missing panel is survivable; a 500 on somebody's customer page is not.
    reportError(error, { where: "ops/getStockMatchingInterest", interestId });
    return [];
  }

  return ((data ?? []) as Omit<MatchingItem, "image">[]).map((row) => ({
    ...row,
    image: null,
  }));
}

/**
 * The same thing for every one of a person's active wants, with thumbnails.
 *
 * One RPC per want — they are independent questions and each is a single
 * indexed scan — then ONE query for the photographs of everything that came
 * back. Fetching media inside the RPC would mean either a fourth join in a
 * function that is already doing text search, or N more round trips; this is
 * the version that stays one query however many wants somebody has.
 */
export async function getStockForWants(
  interestIds: string[]
): Promise<Record<string, MatchingItem[]>> {
  if (interestIds.length === 0) return {};

  const lists = await Promise.all(interestIds.map(getStockMatchingInterest));
  const byInterest = Object.fromEntries(
    interestIds.map((id, index) => [id, lists[index]])
  ) as Record<string, MatchingItem[]>;

  const itemIds = [...new Set(lists.flat().map((row) => row.item_id))];
  if (itemIds.length === 0) return byInterest;

  const client = await supabase();
  const { data } = await client
    .from("item_media")
    .select("item_id, kind, storage_path, external_url, position")
    .in("item_id", itemIds);

  const media = new Map<string, MediaRef[]>();
  for (const row of (data ?? []) as unknown as ({ item_id: string } & MediaRef)[]) {
    media.set(row.item_id, [...(media.get(row.item_id) ?? []), row]);
  }

  for (const list of Object.values(byInterest)) {
    for (const row of list) {
      row.image = coverImage(media.get(row.item_id));
    }
  }

  return byInterest;
}

export type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  intro: string | null;
  state: "draft" | "sending" | "sent" | "failed";
  item_ids: string[];
  recipient_count: number | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
};

export async function listCampaigns(): Promise<CampaignRow[]> {
  const client = await supabase();
  const { data, error } = await client
    .from("outreach_campaigns")
    .select(
      "id, name, subject, intro, state, item_ids, recipient_count, sent_at, error, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CampaignRow[];
}

/**
 * How many people a newsletter would reach.
 *
 * A count, not a list, and the list is deliberately NOT cached anywhere: the
 * recipients are resolved inside sendCampaign() at the moment of sending, so
 * somebody who unsubscribes between writing the email and pressing send is
 * excluded without anyone having to think about it. A stored audience is correct
 * on the day it is built and wrong on the day it is used.
 */
export async function countReachableByEmail(): Promise<number> {
  const client = await supabase();
  const { count } = await client
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .is("unsubscribed_at", null)
    .not("email_consent_at", "is", null)
    .not("email", "is", null);
  return count ?? 0;
}
