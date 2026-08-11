"use server";

import { revalidatePath } from "next/cache";
import { supabase, requireStaff } from "@/lib/supabase";
import {
  heroOnly,
  renderPreview,
  renderPreviewText,
  sendMarketingBatch,
  senderIdentity,
} from "@/lib/email";
import { itemUrl } from "@/lib/message";
import { coverImage, type MediaRef } from "@/lib/media";
import { atLeast, rands } from "@takemore/core";
import { reportError } from "@takemore/observability";

/**
 * The monthly list of what came in.
 *
 * Manager-and-up, and the restriction is a policy on outreach_campaigns rather
 * than a hidden button — the check below is the courtesy, RLS is the rule.
 *
 * The audience is resolved at SEND time from a filter, never stored as a list of
 * addresses. A stored list is correct on the day it is built and wrong on the
 * day it is used, because somebody unsubscribes in between; resolving it here
 * means the opt-out is honoured by construction rather than by remembering.
 */

export type CampaignResult =
  | { ok: true; notice: string }
  | { ok: false; error: string };

export async function createCampaign(formData: FormData): Promise<CampaignResult> {
  const staff = await requireStaff();
  if (!atLeast(staff.role, "manager")) return { ok: false, error: "Managers and owners only." };

  const client = await supabase();
  const read = (key: string) => (formData.get(key) as string | null)?.trim() ?? "";

  const name = read("name");
  const subject = read("subject");
  if (!name || !subject) return { ok: false, error: "It needs a name and a subject line." };

  const itemIds = formData.getAll("item_ids").map(String).filter(Boolean);
  if (itemIds.length === 0) {
    return { ok: false, error: "Pick at least one machine to show off." };
  }

  const { error } = await client.from("outreach_campaigns").insert({
    name,
    subject,
    intro: read("intro") || null,
    item_ids: itemIds,
    audience: {},
    created_by: staff.userId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/outreach/campaigns");
  return { ok: true, notice: "Saved as a draft. Preview it, then send." };
}

export type CampaignPreview =
  | {
      ok: true;
      subject: string;
      from: string;
      replyTo: string | null;
      html: string;
      text: string;
      recipientCount: number;
      items: { title: string; price: string | null; live: boolean }[];
      warnings: string[];
    }
  | { ok: false; error: string };

/**
 * Exactly what will go out, before anything goes out.
 *
 * A campaign send is the one action in this whole system that cannot be walked
 * back. Duplicate sends were already protected — the draft→sending claim is
 * atomic — but nothing protected against sending the RIGHT message once and
 * having it be wrong: a typo in the subject, an intro addressed to the wrong
 * month, a machine that sold this morning.
 *
 * This resolves everything the send would resolve, in the same order, using the
 * same helpers, and renders it with the same wrap() the sender uses. It does not
 * touch the campaign's state, so it can be run as often as somebody likes.
 *
 * The audience count is resolved here too, and is deliberately a COUNT rather
 * than a list: the preview should not put every customer's email address on a
 * screen in a warehouse.
 */
export async function previewCampaign(id: string): Promise<CampaignPreview> {
  const staff = await requireStaff();
  if (!atLeast(staff.role, "manager")) return { ok: false, error: "Managers and owners only." };

  const client = await supabase();

  const { data: campaign, error } = await client
    .from("outreach_campaigns")
    .select("id, subject, intro, item_ids, state")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    reportError(error, { where: "ops/previewCampaign" });
    return { ok: false, error: "Could not load that campaign." };
  }
  if (!campaign) return { ok: false, error: "That campaign is gone." };

  // Every chosen item, not only the live ones — the preview has to be able to
  // say "two of these have sold", which it cannot do if it never sees them.
  const { data: chosen } = await client
    .from("items")
    .select(
      "id, title, brand, slug, status, published_at, deleted_at, list_price_cents, media:item_media(kind, storage_path, external_url, position)"
    )
    .in("id", campaign.item_ids);

  const all = (chosen ?? []) as unknown as {
    id: string;
    title: string;
    brand: string | null;
    slug: string;
    status: string;
    published_at: string | null;
    deleted_at: string | null;
    list_price_cents: number | null;
    media: MediaRef[];
  }[];

  const isLive = (row: (typeof all)[number]) =>
    row.status === "listed" && row.published_at !== null && row.deleted_at === null;

  const live = all.filter(isLive);

  const { count: recipientCount } = await client
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .is("unsubscribed_at", null)
    .not("email_consent_at", "is", null)
    .not("email", "is", null);

  // Read once, so the warning below and the hero the send actually uses cannot
  // disagree. They used to: the warning asked whether there was any media, the
  // hero asked for a picture. An item whose only media is a clip has the first
  // and not the second, and the preview called that fine.
  const hero = coverImage(live[0]?.media) ?? undefined;

  const warnings: string[] = [];
  const goneCount = all.length - live.length;
  const missingCount = campaign.item_ids.length - all.length;

  if (goneCount > 0) {
    warnings.push(
      `${goneCount} of the machines you picked ${goneCount === 1 ? "is" : "are"} no longer for sale and will be left out.`
    );
  }
  if (missingCount > 0) {
    warnings.push(`${missingCount} of the machines you picked no longer exist.`);
  }
  if (live.length === 0) {
    warnings.push("None of these machines are still for sale, so this cannot send.");
  }
  if (live.length > 0 && !hero) {
    warnings.push("No photograph — this will go out as text only.");
  }
  if (campaign.state !== "draft") {
    warnings.push(`This campaign is already "${campaign.state}" and cannot be sent again.`);
  }

  // "there" is the fallback the real send uses for a lead with no name, so the
  // preview shows the least personalised version rather than the best case.
  const body = bodyFor("there", campaign.intro, live);
  const { from, replyTo } = senderIdentity();

  return {
    ok: true,
    subject: campaign.subject,
    from,
    replyTo,
    html: renderPreview(body, heroOnly(hero)),
    text: renderPreviewText(body),
    recipientCount: recipientCount ?? 0,
    items: all.map((row) => ({
      title: row.title,
      price: row.list_price_cents ? rands(row.list_price_cents) : null,
      live: isLive(row),
    })),
    warnings,
  };
}

export async function deleteCampaign(id: string): Promise<CampaignResult> {
  const staff = await requireStaff();
  if (!atLeast(staff.role, "manager")) return { ok: false, error: "Managers and owners only." };

  const client = await supabase();
  const { error } = await client
    .from("outreach_campaigns")
    .delete()
    .eq("id", id)
    .eq("state", "draft");

  if (error) return { ok: false, error: error.message };
  revalidatePath("/outreach/campaigns");
  return { ok: true, notice: "Deleted." };
}

/**
 * Build the body one recipient at a time.
 *
 * Not a template with a merge field: each person gets their own unsubscribe
 * token, and a shared link would unsubscribe whoever clicked it from somebody
 * else's list.
 */
function bodyFor(
  firstName: string,
  intro: string | null,
  items: { title: string; brand: string | null; slug: string; list_price_cents: number | null }[]
): string {
  const lines = items.map(
    (item) =>
      `• ${[item.brand, item.title].filter(Boolean).join(" ")}${
        item.list_price_cents ? ` — ${rands(item.list_price_cents)}` : ""
      }\n  ${itemUrl(item.slug)}`
  );

  return [
    `Hi ${firstName},`,
    "",
    intro?.trim() ||
      "Here is what came through the workshop this month. Everything below is stripped, tested and graded, and you are welcome to come and watch any of it run before you pay a cent.",
    "",
    ...lines,
    "",
    "Each one is a single unit — when it goes, it goes. Reply to this and we will hold one for you.",
    "",
    "— Take More Catering Equipment, Montague Gardens",
  ].join("\n");
}

/**
 * Send it.
 *
 * Marked `sending` first, so a second tap while the batch is in flight finds a
 * row that is no longer a draft and stops. A newsletter sent twice is the one
 * mistake in this whole feature that cannot be walked back.
 */
export async function sendCampaign(id: string): Promise<CampaignResult> {
  const staff = await requireStaff();
  if (!atLeast(staff.role, "manager")) return { ok: false, error: "Managers and owners only." };

  const client = await supabase();

  const { data: campaign } = await client
    .from("outreach_campaigns")
    .select("id, subject, intro, item_ids, state")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) return { ok: false, error: "That campaign is gone." };
  if (campaign.state !== "draft") {
    return { ok: false, error: "That one has already been sent." };
  }

  const { error: claimError, count } = await client
    .from("outreach_campaigns")
    .update({ state: "sending" }, { count: "exact" })
    .eq("id", id)
    .eq("state", "draft");

  if (claimError) return { ok: false, error: claimError.message };
  if (count === 0) return { ok: false, error: "Somebody else is already sending that one." };

  // Only stock that is still live and still for sale. A newsletter linking to a
  // machine that sold yesterday is worse than no newsletter.
  const { data: items } = await client
    .from("items")
    .select("id, title, brand, slug, list_price_cents, media:item_media(kind, storage_path, external_url, position)")
    .in("id", campaign.item_ids)
    .eq("status", "listed")
    .not("published_at", "is", null)
    .is("deleted_at", null);

  const live = (items ?? []) as unknown as {
    title: string;
    brand: string | null;
    slug: string;
    list_price_cents: number | null;
    media: MediaRef[];
  }[];

  if (live.length === 0) {
    await client
      .from("outreach_campaigns")
      .update({ state: "draft", error: "None of those machines are still for sale." })
      .eq("id", id);
    return { ok: false, error: "None of those machines are still for sale. Pick again." };
  }

  const { data: audience } = await client
    .from("leads")
    .select("full_name, email, unsubscribe_token")
    .is("deleted_at", null)
    .is("unsubscribed_at", null)
    .not("email_consent_at", "is", null)
    .not("email", "is", null);

  const recipients = (audience ?? []) as unknown as {
    full_name: string | null;
    email: string;
    unsubscribe_token: string;
  }[];

  if (recipients.length === 0) {
    await client.from("outreach_campaigns").update({ state: "draft" }).eq("id", id);
    return { ok: false, error: "Nobody has agreed to emails yet." };
  }

  const hero = coverImage(live[0].media) ?? undefined;

  const result = await sendMarketingBatch(
    recipients.map((lead) => ({
      to: lead.email,
      subject: campaign.subject,
      body: bodyFor(
        (lead.full_name ?? "").trim().split(/\s+/)[0] || "there",
        campaign.intro,
        live
      ),
      unsubscribeToken: lead.unsubscribe_token,
      media: heroOnly(hero),
    }))
  );

  await client
    .from("outreach_campaigns")
    .update({
      state: result.sent > 0 ? "sent" : "failed",
      recipient_count: result.sent,
      sent_at: new Date().toISOString(),
      sent_by: staff.userId,
      error: result.errors.length ? result.errors.join(" · ") : null,
    })
    .eq("id", id);

  revalidatePath("/outreach/campaigns");
  revalidatePath("/leads");

  if (result.sent === 0) {
    return { ok: false, error: result.errors.join(" · ") || "Nothing went out." };
  }

  return {
    ok: true,
    notice: `Sent to ${result.sent} ${result.sent === 1 ? "person" : "people"}.${
      result.failed ? ` ${result.failed} failed.` : ""
    }`,
  };
}
