import { supabase } from "./supabase";
import type {
  LeadEventKind,
  LeadSource,
  LeadStatus,
  OutreachChannel,
  OutreachState,
} from "@takemore/core";

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
  lead: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    phone_e164: string | null;
  } | null;
  item: {
    id: string;
    title: string;
    brand: string | null;
    slug: string;
    list_price_cents: number | null;
    media: { storage_path: string | null; external_url: string | null }[];
  } | null;
};

/** The review queue: everything waiting for a human to send or dismiss. */
export async function getQueuedOutreach(): Promise<QueuedMessage[]> {
  const client = await supabase();
  const { data, error } = await client
    .from("outreach_messages")
    .select(
      `id, channel, state, reason, body, match_score, created_at,
       lead:leads(id, full_name, email, phone, phone_e164),
       item:items(id, title, brand, slug, list_price_cents,
                  media:item_media(storage_path, external_url))`
    )
    .eq("state", "queued")
    .order("match_score", { ascending: false })
    .limit(200);

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
  full_name: string | null;
  phone: string | null;
  email: string | null;
  description: string;
  score: number;
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
    console.error("leads_wanting_item failed:", error.message);
    return [];
  }
  return (data ?? []) as WantingLead[];
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
