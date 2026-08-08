import Link from "next/link";
import { requireStaff } from "@/lib/supabase";
import { getQueuedOutreach } from "@/lib/leads";
import { emailIsConfigured } from "@/lib/email";
import { draftMatchMessage, itemUrl } from "@/lib/message";
import { mediaUrl } from "@/lib/media";
import { atLeast } from "@takemore/core";
import OutreachQueue, { type QueueEntry } from "./OutreachQueue";

export const dynamic = "force-dynamic";

/**
 * The review queue.
 *
 * Matching is automatic; sending is not. Two reasons, and the second is the one
 * that matters: a mispriced machine or a photo taken before the strip-down would
 * otherwise reach forty people before anybody could catch it, and there is no
 * unsend on a WhatsApp. The consent checks, the frequency cap and the
 * de-duplication all run in SQL without anybody thinking about them; what a
 * human adds here is judgement about whether this particular machine is worth
 * this particular person's attention.
 *
 * Drafts are composed on the server so the queue arrives ready to send. A
 * suggestion you have to write a message for is a suggestion nobody actions.
 */
export default async function OutreachPage() {
  const staff = await requireStaff();
  const queued = await getQueuedOutreach();

  const entries: QueueEntry[] = queued
    .filter((message) => message.lead && message.item)
    .map((message) => {
      const lead = message.lead!;
      const item = message.item!;
      return {
        id: message.id,
        channel: message.channel,
        reason: message.reason,
        score: message.match_score,
        leadId: lead.id,
        leadName: lead.full_name,
        leadEmail: lead.email,
        leadPhoneDigits: lead.phone_e164?.replace(/\D/g, "") ?? null,
        itemTitle: item.title,
        itemSlug: item.slug,
        itemUrl: itemUrl(item.slug),
        itemImage: item.media?.length ? mediaUrl(item.media[0], "card") : null,
        itemPriceCents: item.list_price_cents,
        draft:
          message.body ??
          draftMatchMessage(
            {
              leadName: lead.full_name,
              // The reason string already carries their own words in quotes;
              // pulling the interest row again just to re-read them would be a
              // second query per suggestion for the same sentence.
              want: extractQuoted(message.reason),
              wantCategory: null,
              itemTitle: item.title,
              itemBrand: item.brand,
              itemSlug: item.slug,
              itemPriceCents: item.list_price_cents,
              itemGrade: null,
            },
            message.channel
          ),
      };
    });

  return (
    <div className="max-w-4xl">
      <header className="mb-5">
        <div className="flex items-center space-x-3 mb-1">
          <div className="w-5 h-1 rounded-full bg-accent" />
          <span className="text-accent uppercase text-[11px] tracking-wider">Outreach</span>
        </div>
        <h1 className="text-xl font-medium tracking-tight">
          {entries.length === 0
            ? "Nothing waiting"
            : `${entries.length} ${entries.length === 1 ? "person" : "people"} to tell`}
        </h1>
        <p className="text-sm font-light text-muted mt-1">
          Machines that match what somebody told us they were looking for. Read it, change
          anything, send it.
        </p>
        {atLeast(staff.role, "manager") && (
          <Link
            href="/outreach/campaigns"
            className="inline-flex items-center gap-2 mt-3 text-xs font-light text-muted hover:text-accent transition-colors"
          >
            <iconify-icon icon="solar:letter-linear" width="14" height="14" noobserver="" />
            Or send everyone the monthly list
          </Link>
        )}
      </header>

      {!emailIsConfigured() && (
        <div className="text-xs font-light text-muted bg-card border border-border rounded-xl px-3 py-2.5 mb-4">
          Email is not connected yet, so only the WhatsApp suggestions can be sent.
          Add <span className="text-white/80">RESEND_API_KEY</span> to turn the rest on.
        </div>
      )}

      {entries.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-background border border-border flex items-center justify-center text-muted mx-auto mb-4">
            <iconify-icon icon="solar:magic-stick-3-linear" width="22" height="22" noobserver="" />
          </div>
          <p className="text-base font-medium tracking-tight mb-1">Everyone is up to date</p>
          <p className="text-sm font-light text-muted max-w-sm mx-auto">
            When a machine arrives that matches what somebody asked for, the draft appears
            here.{" "}
            <Link href="/leads" className="text-white/80 hover:text-accent transition-colors">
              Record what people want
            </Link>{" "}
            and this fills itself.
          </p>
        </div>
      ) : (
        <OutreachQueue entries={entries} canRunMatch={atLeast(staff.role, "manager")} />
      )}
    </div>
  );
}

/**
 * The customer's own words, back out of the reason string the matcher built.
 *
 * A small piece of string handling in exchange for not running a second query
 * per suggestion. If the reason format ever changes, the draft quietly falls
 * back to the category phrasing rather than breaking.
 */
function extractQuoted(reason: string | null): string | null {
  const match = reason?.match(/"([^"]+)"/);
  return match ? match[1] : null;
}
