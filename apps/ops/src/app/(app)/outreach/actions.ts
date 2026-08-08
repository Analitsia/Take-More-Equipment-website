"use server";

import { revalidatePath } from "next/cache";
import { supabase, requireStaff } from "@/lib/supabase";
import { sendMarketingEmail } from "@/lib/email";
import { atLeast } from "@takemore/core";

/**
 * Working the queue.
 *
 * Two verbs — send and skip — and both are a state change on a row the matcher
 * already wrote. The timeline entry and last_contacted_at are handled by
 * database triggers, so there is nothing here to forget.
 *
 * The one rule enforced in this file rather than in SQL is the seven-day
 * frequency cap at SEND time. The matcher already applies it when queueing, but
 * a suggestion can sit in the queue for a week, and the question that matters is
 * "have we messaged this person recently" at the moment somebody taps, not at
 * the moment the machine arrived.
 */

export type OutreachResult =
  | { ok: true; notice?: string; whatsappUrl?: string }
  | { ok: false; error: string };

const FREQUENCY_CAP_DAYS = 7;

async function recentlyMessaged(leadId: string): Promise<string | null> {
  const client = await supabase();
  const since = new Date(Date.now() - FREQUENCY_CAP_DAYS * 86_400_000).toISOString();

  const { data } = await client
    .from("outreach_messages")
    .select("sent_at")
    .eq("lead_id", leadId)
    .eq("state", "sent")
    .gt("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.sent_at ?? null;
}

/**
 * Mark a WhatsApp suggestion as sent.
 *
 * The actual sending is the staff member tapping through to WhatsApp, so this
 * records the fact rather than performing it. Called after the wa.me link opens.
 * Believing the tap is a deliberate trade: the alternative is the Meta Cloud
 * API, which costs about R1.50 a message and needs template approval before a
 * single word can be sent.
 */
export async function markSent(
  messageId: string,
  body: string
): Promise<OutreachResult> {
  const staff = await requireStaff();
  const client = await supabase();

  const { data: message } = await client
    .from("outreach_messages")
    .select("lead_id, state")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) return { ok: false, error: "That suggestion is no longer there." };
  if (message.state === "sent") return { ok: true, notice: "Already sent." };

  const recent = await recentlyMessaged(message.lead_id);
  if (recent) {
    return {
      ok: false,
      error: `We already messaged them on ${new Date(recent).toLocaleDateString("en-ZA")}. Give it a week, or phone them instead.`,
    };
  }

  const { error } = await client
    .from("outreach_messages")
    .update({
      state: "sent",
      body,
      sent_at: new Date().toISOString(),
      sent_by: staff.userId,
    })
    .eq("id", messageId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/outreach");
  revalidatePath("/leads");
  return { ok: true, notice: "Logged on their timeline." };
}

/** Send a queued suggestion by email, now, from the server. */
export async function sendByEmail(
  messageId: string,
  body: string
): Promise<OutreachResult> {
  const staff = await requireStaff();
  const client = await supabase();

  const { data: message } = await client
    .from("outreach_messages")
    .select(
      `id, state, lead_id,
       lead:leads(full_name, email, unsubscribed_at, email_consent_at, unsubscribe_token),
       item:items(title, brand, slug)`
    )
    .eq("id", messageId)
    .maybeSingle();

  if (!message) return { ok: false, error: "That suggestion is no longer there." };
  if (message.state === "sent") return { ok: true, notice: "Already sent." };

  const lead = message.lead as unknown as {
    full_name: string | null;
    email: string | null;
    unsubscribed_at: string | null;
    email_consent_at: string | null;
    unsubscribe_token: string;
  } | null;
  const item = message.item as unknown as {
    title: string;
    brand: string | null;
    slug: string;
  } | null;

  // Re-checked at the moment of sending, not just at the moment of queueing.
  // Somebody can opt out in the days a suggestion sits waiting, and the queue is
  // a snapshot.
  if (!lead?.email) return { ok: false, error: "No email address on file." };
  if (lead.unsubscribed_at) return { ok: false, error: "They have opted out. Nothing sent." };
  if (!lead.email_consent_at) {
    return { ok: false, error: "They have not agreed to emails. Ask first, then record it on their page." };
  }

  const recent = await recentlyMessaged(message.lead_id);
  if (recent) {
    return {
      ok: false,
      error: `We already messaged them on ${new Date(recent).toLocaleDateString("en-ZA")}. Give it a week.`,
    };
  }

  const result = await sendMarketingEmail({
    to: lead.email,
    subject: item ? `We found you ${[item.brand, item.title].filter(Boolean).join(" ")}` : "New stock at Take More",
    body,
    unsubscribeToken: lead.unsubscribe_token,
  });

  if (!result.ok) {
    // Recorded as failed rather than left queued, so the outreach_once index
    // lets it be tried again — `failed` is the one state that does not block.
    await client
      .from("outreach_messages")
      .update({ state: "failed", body, error: result.error })
      .eq("id", messageId);
    revalidatePath("/outreach");
    return { ok: false, error: result.error };
  }

  const { error } = await client
    .from("outreach_messages")
    .update({
      state: "sent",
      body,
      sent_at: new Date().toISOString(),
      sent_by: staff.userId,
    })
    .eq("id", messageId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/outreach");
  revalidatePath("/leads");
  return { ok: true, notice: `Sent to ${lead.email}.` };
}

/**
 * Not this one.
 *
 * A skipped suggestion stays skipped — the outreach_once index covers every
 * state except `failed` — so tonight's sweep will not put it back. That is the
 * whole reason the index is written the way it is.
 */
export async function skipMessage(
  messageId: string,
  reason?: string
): Promise<OutreachResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("outreach_messages")
    .update({ state: "skipped", skipped_reason: reason?.trim() || null })
    .eq("id", messageId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/outreach");
  return { ok: true };
}

/**
 * Look for matches now, rather than waiting for tonight.
 *
 * The same function the publish path and the nightly sweep call. Safe to press
 * repeatedly — the unique index absorbs every repeat.
 */
export async function runMatchNow(): Promise<OutreachResult> {
  const staff = await requireStaff();
  if (!atLeast(staff.role, "manager")) {
    return { ok: false, error: "Managers and owners only." };
  }

  const client = await supabase();
  const { data, error } = await client.rpc("run_stock_match");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/outreach");
  return {
    ok: true,
    notice:
      data === 0
        ? "Nothing new to suggest — everyone who matches has already been told."
        : `${data} new ${data === 1 ? "suggestion" : "suggestions"}.`,
  };
}
