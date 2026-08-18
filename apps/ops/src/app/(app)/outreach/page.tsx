import Link from "next/link";
import { requireStaff } from "@/lib/supabase";
import { getQueuedOutreach, getSentOutreach, type QueuedMessage } from "@/lib/leads";
import { emailIsConfigured } from "@/lib/email";
import { draftMatchMessage, itemUrl, wantWords } from "@/lib/message";
import { coverImage, photoUrls, videoClips } from "@/lib/media";
import { atLeast } from "@takemore/core";
import OutreachQueue, { type QueueEntry } from "./OutreachQueue";

export const dynamic = "force-dynamic";

/**
 * When it went, in warehouse time.
 *
 * Formatted on the server and shipped as a finished string. Doing it in the
 * client component instead would render one timezone during SSR and another
 * after hydration, which React reports as a mismatch and a person reads as the
 * app being wrong about when they sent something.
 */
const SENT_FORMAT = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

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
 *
 * The page reads TWO lists, not one. What has already gone out stays on this
 * screen behind a toggle, because on the WhatsApp path "sent" is inferred from
 * a tap and never confirmed — see getSentOutreach() and resendMessage().
 */
export default async function OutreachPage() {
  // In parallel: the reads answer to RLS on their own, and the redirect out of
  // requireStaff() still fires before anything renders.
  const [staff, queued, sent] = await Promise.all([
    requireStaff(),
    getQueuedOutreach(),
    getSentOutreach(),
  ]);

  const toEntry = (message: QueuedMessage): QueueEntry => {
    const lead = message.lead!;
    const item = message.item!;
    // Only email carries the gallery, so only email's copy should promise it.
    const photos = message.channel === "email" ? photoUrls(item.media).length : 0;
    const clips = message.channel === "email" ? videoClips(item.media).length : 0;

    return {
      id: message.id,
      channel: message.channel,
      reason: message.reason,
      score: message.match_score,
      sentLabel: message.sent_at ? SENT_FORMAT.format(new Date(message.sent_at)) : null,
      leadId: lead.id,
      leadName: lead.full_name,
      leadEmail: lead.email,
      leadPhoneDigits: lead.phone_e164?.replace(/\D/g, "") ?? null,
      itemTitle: item.title,
      itemSlug: item.slug,
      itemUrl: itemUrl(item.slug),
      itemImage: coverImage(item.media),
      itemPriceCents: item.list_price_cents,
      draft:
        message.body ??
        draftMatchMessage(
          {
            leadName: lead.full_name,
            // The want itself, now that the message row records which one it
            // answers. wantWords() falls back to the quoted fragment in the
            // reason string for suggestions queued before that column existed.
            ...wantWords(message.interest, message.reason),
            itemTitle: item.title,
            itemBrand: item.brand,
            itemSlug: item.slug,
            itemPriceCents: item.list_price_cents,
            itemGrade: item.condition_grade,
            photoCount: photos,
            videoCount: clips,
          },
          message.channel
        ),
    };
  };

  const complete = (message: QueuedMessage) => Boolean(message.lead && message.item);
  const entries = queued.filter(complete).map(toEntry);
  const sentEntries = sent.filter(complete).map(toEntry);

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
          anything, send it. One message is about one machine, and somebody who asked for two
          different things gets two separate messages.
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

      <OutreachQueue
        entries={entries}
        sentEntries={sentEntries}
        canRunMatch={atLeast(staff.role, "manager")}
      />
    </div>
  );
}
