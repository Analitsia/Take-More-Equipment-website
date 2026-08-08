"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase, requireStaff } from "@/lib/supabase";
import { normalisePhone, type LeadEventKind, type LeadSource, type LeadStatus } from "@takemore/core";

/**
 * Every mutation the CRM makes.
 *
 * Thin, like items/actions.ts, and for the same reason: the rules — who may
 * read a lead, that a phone number has one spelling, that consent changes write
 * their own audit entry — all live in the database. An action's job is to pass
 * the intent along and report what happened.
 *
 * The one thing NOT delegated is the consent copy: `consent_source` has to say
 * something a person could defend to a regulator, and only the caller knows
 * whether this tick came from a form, a phone call or a signed slip.
 */

export type ActionResult =
  | { ok: true; notice?: string }
  | { ok: false; error: string };

const humanise = (message: string): string => {
  if (message.includes("leads_reachable")) {
    return "A lead needs an email address or a phone number.";
  }
  if (message.includes("leads_email_shape")) {
    return "That email address does not look right.";
  }
  if (message.includes("leads_email_key") || (message.includes("duplicate") && message.includes("email"))) {
    return "Somebody else in the list already has that email address.";
  }
  if (message.includes("leads_phone_key") || (message.includes("duplicate") && message.includes("phone"))) {
    return "Somebody else in the list already has that phone number.";
  }
  if (message.includes("lead_interests_subcategory")) {
    return "That type does not belong to that category.";
  }
  if (message.includes("permission denied") || message.includes("row-level security")) {
    return "You don't have permission to do that.";
  }
  return message;
};

export type LeadPatch = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  birthday?: string | null;
  business_name?: string | null;
  source?: LeadSource;
  status?: LeadStatus;
  notes?: string | null;
};

export async function createLead(formData: FormData): Promise<never> {
  const staff = await requireStaff();
  const client = await supabase();

  const read = (key: string) => (formData.get(key) as string | null)?.trim() || null;
  const phone = read("phone");
  const email = read("email");

  const { data, error } = await client
    .from("leads")
    .insert({
      full_name: read("full_name"),
      email,
      phone,
      business_name: read("business_name"),
      source: (read("source") as LeadSource) ?? "walk_in",
      created_by: staff.userId,
    })
    .select("id")
    .single();

  let leadId = data?.id;

  if (error) {
    // Already in the list — which is not a failure, it is the CRM working. A
    // worker taking details at the counter cannot know whether this person
    // enquired from the website in March, and answering with an error page
    // teaches them to make a second row on purpose next time. Open the one that
    // exists instead, so their new want is added to the right person.
    const duplicate =
      error.message.includes("leads_email_key") || error.message.includes("leads_phone_key");
    if (!duplicate) throw new Error(humanise(error.message));

    const existing = await client
      .from("leads")
      .select("id")
      .is("deleted_at", null)
      .or(
        [
          email ? `email.ilike.${email}` : null,
          // Matched on the generated column, so "082…" finds the row stored as
          // "+27…" — which is the whole reason that column exists.
          phone ? `phone_e164.eq.${normalisePhone(phone)}` : null,
        ]
          .filter(Boolean)
          .join(",")
      )
      .limit(1)
      .maybeSingle();

    if (!existing.data) throw new Error(humanise(error.message));
    leadId = existing.data.id;
  }

  // What they came in asking for, captured in the same breath as their name.
  // Optional: a worker who only got a number should not be stopped from saving
  // it, and the interest can be added from the lead's page in a moment.
  // Narrowed for the compiler's benefit: every branch above either assigns an
  // id or throws, but neither is expressible in the type of `data?.id`.
  if (!leadId) throw new Error("Could not save that person.");

  const wants = read("wants");
  const categoryId = read("category_id");
  if (wants || categoryId) {
    await client.from("lead_interests").insert({
      lead_id: leadId,
      description: wants ?? "",
      category_id: categoryId,
      created_by: staff.userId,
    });
  }

  revalidatePath("/leads");
  redirect(`/leads/${leadId}`);
}

export async function updateLead(id: string, patch: LeadPatch): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client.from("leads").update(patch).eq("id", id);
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
  return { ok: true };
}

/**
 * Consent, changed by hand.
 *
 * `source` is required rather than optional, because a consent record that
 * cannot say where it came from is not evidence of anything. The database
 * trigger turns this into a timeline entry automatically, so there is no second
 * write here to forget.
 */
export async function setConsent(
  id: string,
  channel: "email" | "whatsapp",
  granted: boolean,
  source: string
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  // Spelled out rather than a computed key: a computed key widens the object to
  // an index signature, which the generated row type rejects — and the branch
  // is one line longer and impossible to get wrong.
  const at = granted ? new Date().toISOString() : null;
  const patch =
    channel === "email"
      ? { email_consent_at: at, consent_source: source.trim() || null }
      : { whatsapp_consent_at: at, consent_source: source.trim() || null };

  const { error } = await client.from("leads").update(patch).eq("id", id);

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/leads/${id}`);
  return {
    ok: true,
    notice: granted
      ? `They will now get ${channel === "email" ? "emails" : "WhatsApps"} about new stock.`
      : "Stopped.",
  };
}

/**
 * Putting somebody back on the list after they opted out.
 *
 * Deliberately separate from setConsent, deliberately requires a note, and
 * deliberately cannot be done from the website. Somebody who objected and has
 * now changed their mind is a conversation a human had, and the note is the
 * record of it.
 */
export async function setUnsubscribed(
  id: string,
  unsubscribed: boolean,
  note?: string
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  if (!unsubscribed && !note?.trim()) {
    return { ok: false, error: "Say who asked to go back on the list, and when." };
  }

  const { error } = await client
    .from("leads")
    .update({
      unsubscribed_at: unsubscribed ? new Date().toISOString() : null,
      ...(note?.trim() ? { consent_source: note.trim() } : {}),
    })
    .eq("id", id);

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
  return {
    ok: true,
    notice: unsubscribed ? "Taken off every list." : "Back on the list.",
  };
}

export type InterestPatch = {
  category_id?: string | null;
  subcategory_id?: string | null;
  budget_max_cents?: number | null;
  min_grade?: "A" | "B" | "C" | null;
  description?: string;
  active?: boolean;
};

export async function addInterest(leadId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("lead_interests")
    .insert({ lead_id: leadId, description: "", created_by: staff.userId });

  if (error) return { ok: false, error: humanise(error.message) };
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function updateInterest(
  leadId: string,
  interestId: string,
  patch: InterestPatch
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  // Changing category has to clear a subcategory that belonged to the old one,
  // or the composite foreign key refuses the write with a message about a
  // constraint nobody outside this file has heard of.
  const next: InterestPatch = { ...patch };
  if ("category_id" in patch) next.subcategory_id = null;

  const { error } = await client.from("lead_interests").update(next).eq("id", interestId);
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function setInterestTags(
  leadId: string,
  interestId: string,
  tagIds: string[]
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error: clearError } = await client
    .from("lead_interest_tags")
    .delete()
    .eq("interest_id", interestId);
  if (clearError) return { ok: false, error: humanise(clearError.message) };

  if (tagIds.length) {
    const { error } = await client
      .from("lead_interest_tags")
      .insert(tagIds.map((tag_id) => ({ interest_id: interestId, tag_id })));
    if (error) return { ok: false, error: humanise(error.message) };
  }

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function deleteInterest(
  leadId: string,
  interestId: string
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client.from("lead_interests").delete().eq("id", interestId);
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

/**
 * Mark a want as satisfied.
 *
 * Kept rather than deleted, so the customer's page still shows what they were
 * after last March — which is exactly the context the person at the counter
 * wants — while the matcher stops offering them another one.
 */
export async function fulfilInterest(
  leadId: string,
  interestId: string,
  itemId?: string
): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("lead_interests")
    .update({
      active: false,
      fulfilled_at: new Date().toISOString(),
      fulfilled_by_item_id: itemId ?? null,
    })
    .eq("id", interestId);

  if (error) return { ok: false, error: humanise(error.message) };
  revalidatePath(`/leads/${leadId}`);
  return { ok: true, notice: "Marked as found." };
}

/** A note, a call, a visit — the things staff log by hand. */
export async function addEvent(
  leadId: string,
  kind: LeadEventKind,
  body: string
): Promise<ActionResult> {
  const staff = await requireStaff();
  const client = await supabase();

  if (!body.trim()) return { ok: false, error: "Write something first." };

  const { error } = await client.from("lead_events").insert({
    lead_id: leadId,
    kind,
    body: body.trim(),
    actor_id: staff.userId,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { ok: true };
}

/**
 * Soft delete, always.
 *
 * The partial unique indexes on email and phone exclude deleted rows, so the
 * same person can be entered again later without a collision — while the
 * timeline of what we actually said to them survives.
 */
export async function softDeleteLead(id: string): Promise<ActionResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: humanise(error.message) };
  revalidatePath("/leads");
  return { ok: true };
}
