import "server-only";
import { Resend } from "resend";

/**
 * Sending mail.
 *
 * Resend is the transport; Postgres stays the source of truth. Resend's own
 * Audiences and Broadcasts would handle unsubscribes for us, and we deliberately
 * do not use them: POPIA requires US to be able to show when and how somebody
 * consented and that we honoured their objection, and a consent record that
 * lives in a vendor's dashboard is not one we control. The `leads` table is the
 * record; Resend is a pipe.
 *
 * The cost of that choice is that we set the compliance headers ourselves, which
 * is what the rest of this file is mostly about.
 */

const KEY = process.env.RESEND_API_KEY;
/**
 * Marketing goes out on its own subdomain, separate from anything
 * transactional. A spam complaint about a newsletter must not be able to damage
 * the deliverability of a message somebody is actually waiting for.
 */
const FROM = process.env.RESEND_MARKETING_FROM ?? "Take More <stock@news.takemoreequipment.co.za>";
const REPLY_TO = process.env.RESEND_REPLY_TO;
const STOREFRONT =
  process.env.NEXT_PUBLIC_STOREFRONT_URL ??
  process.env.STOREFRONT_URL ??
  "https://takemoreequipment.co.za";

/**
 * The postal identity in the footer of every marketing email.
 *
 * A physical address in a commercial message is not decoration — it is what
 * makes the sender identifiable, which POPIA s69 and every major mailbox
 * provider's bulk-sender guidance both expect. It was hardcoded here with the
 * same placeholder address the website carried, which meant fixing the website
 * would silently leave the email wrong.
 *
 * It is an environment variable rather than an import because apps/web's launch
 * manifest is not reachable from here. The launch gate asserts every variable
 * the code reads appears in .env.example, and docs/launch-checklist.md lists
 * this one beside the manifest entry it has to agree with.
 */
const POSTAL_IDENTITY =
  process.env.BUSINESS_POSTAL_IDENTITY ??
  // The REGISTERED name, not the trading name — this line exists to make the
  // sender legally identifiable, and "Take More Catering Equipment" is what the
  // business trades as rather than what it is. Verified with the owner on
  // 2026-08-20 and matching contact.legalName in the storefront's manifest.
  "Take More Equipment (Pty) Ltd, Unit 4, 19 6th Rd, Montague Gardens, Cape Town, 7441";

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

const unsubscribeUrl = (token: string) =>
  `${STOREFRONT.replace(/\/$/, "")}/unsubscribe?token=${token}`;

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Bare links in a plain-text draft become real links in the HTML version. */
const linkify = (text: string) =>
  escape(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#123f42;text-decoration:underline">$1</a>'
  );

/**
 * The pictures and clips an email carries.
 *
 * Photographs are EMBEDDED BY URL, not attached. The bucket is public and
 * CDN-backed, so a referenced image costs the recipient one cached request and
 * costs us nothing; four attached JPEGs would be a few megabytes on every send,
 * and mailbox providers treat large attachments from a bulk sender as a
 * deliverability problem rather than a courtesy.
 *
 * Clips are LINKED, and that is not a shortcut either. No mail client plays
 * video inline — Gmail, Outlook and Apple Mail all strip a <video> tag — and a
 * 30-second workshop clip is tens of megabytes, over Resend's own attachment
 * ceiling before anybody's inbox quota is considered. A labelled link to the
 * file plays on one tap in every browser on every phone, which is what somebody
 * standing in a kitchen is actually going to do.
 */
export type EmailMedia = {
  /** Photograph URLs, in the workshop's own order. The first becomes the hero. */
  photos: string[];
  /** Clips, as a link and the words to put on it. */
  videos: { url: string; label: string }[];
};

/** The campaign template's single hero, expressed in the shape above. */
export const heroOnly = (url: string | null | undefined): EmailMedia | undefined =>
  url ? { photos: [url], videos: [] } : undefined;

/**
 * Ceilings, so a machine photographed twenty times does not produce an email
 * nobody scrolls to the bottom of. The rest are on the item's own page, which
 * every one of these emails links to.
 */
const MAX_PHOTOS = 4;
const MAX_VIDEOS = 2;

const photoTag = (url: string, width: string, margin: string, display: string) =>
  `<img src="${escape(url)}" alt="" style="width:${width};max-width:100%;height:auto;border-radius:10px;margin:${margin};display:${display}">`;

/**
 * The one email template.
 *
 * Deliberately plain. This business sells second-hand machines to kitchens; an
 * email that looks like a newsletter template looks like an advert, and an email
 * that looks like a person typed it gets read. Everything is inline-styled and
 * table-free, which is the only thing every mail client agrees on.
 *
 * The media is split around the words on purpose: one photograph above, so the
 * machine is the first thing seen, and the rest below, so the sentence that
 * says why we are writing is not buried under a contact sheet.
 */
function wrap(body: string, token: string, media?: EmailMedia): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px">${linkify(block).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const photos = (media?.photos ?? []).filter(Boolean).slice(0, MAX_PHOTOS);
  const videos = (media?.videos ?? []).slice(0, MAX_VIDEOS);
  const [hero, ...rest] = photos;

  // inline-block rather than a grid or a flex row: Outlook's Word rendering
  // engine understands neither, and its fallback for this is to stack the
  // pictures full width, which is a worse layout and not a broken one.
  const thumbnails = rest
    .map((url) => photoTag(url, "31%", "0 1.5% 8px 0", "inline-block"))
    .join("");

  const clips = videos
    .map(
      (video) =>
        `<a href="${escape(video.url)}" style="display:block;margin:0 0 8px;padding:12px 14px;border:1px solid #e8e8e2;border-radius:10px;color:#1a1a17;text-decoration:none;font-size:14px">
           <span style="color:#123f42">&#9654;</span>&nbsp; ${escape(video.label)}
         </a>`
    )
    .join("");

  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f5f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px">
    <p style="margin:0 0 20px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a8a80">
      Take More Catering Equipment
    </p>
    ${hero ? photoTag(hero, "504px", "0 0 20px", "block") : ""}
    <div style="font-size:15px;line-height:1.6;color:#1a1a17">${paragraphs}</div>
    ${thumbnails ? `<div style="margin:4px 0 16px">${thumbnails}</div>` : ""}
    ${clips ? `<div style="margin:4px 0 16px">${clips}</div>` : ""}
    <hr style="border:none;border-top:1px solid #e8e8e2;margin:28px 0 16px">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8a80">
      You are getting this because you asked us to tell you when we get equipment
      like this. ${escape(POSTAL_IDENTITY)}.
      <br>
      <a href="${unsubscribeUrl(token)}" style="color:#8a8a80">Unsubscribe in one click</a>
      — it takes effect immediately.
    </p>
  </div>
</body></html>`;
}

function client(): Resend | null {
  if (!KEY) return null;
  return new Resend(KEY);
}

/**
 * One marketing email.
 *
 * The two List-Unsubscribe headers are not optional. RFC 8058 one-click
 * unsubscribe has been a requirement for bulk senders at Gmail and Yahoo since
 * February 2024 — without them this mail lands in spam regardless of how good
 * the match was — and POPIA s69 separately requires an opt-out in EVERY message,
 * which is why the footer carries a visible link as well as the header.
 */
export async function sendMarketingEmail({
  to,
  subject,
  body,
  unsubscribeToken,
  media,
}: {
  to: string;
  subject: string;
  body: string;
  unsubscribeToken: string;
  media?: EmailMedia;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    return {
      ok: false,
      error:
        "Email is not set up yet — RESEND_API_KEY is missing. WhatsApp them instead, or ask Carlo to add the key.",
    };
  }

  const url = unsubscribeUrl(unsubscribeToken);

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      replyTo: REPLY_TO,
      text: `${body}\n\n---\nStop these: ${url}`,
      html: wrap(body, unsubscribeToken, media),
      headers: {
        "List-Unsubscribe": `<${url}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? "" };
  } catch (thrown) {
    return { ok: false, error: thrown instanceof Error ? thrown.message : String(thrown) };
  }
}

export type BatchRecipient = {
  to: string;
  subject: string;
  body: string;
  unsubscribeToken: string;
  media?: EmailMedia;
};

/**
 * A newsletter.
 *
 * Resend's batch endpoint takes 100 at a time, so this chunks. Each message is
 * built individually rather than BCC'd, because every recipient needs their own
 * unsubscribe token — a shared link would unsubscribe whoever clicked it from
 * somebody else's list.
 */
export async function sendMarketingBatch(
  recipients: BatchRecipient[]
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const resend = client();
  if (!resend) {
    return { sent: 0, failed: recipients.length, errors: ["RESEND_API_KEY is not set."] };
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100);
    try {
      const { data, error } = await resend.batch.send(
        chunk.map((recipient) => {
          const url = unsubscribeUrl(recipient.unsubscribeToken);
          return {
            from: FROM,
            to: recipient.to,
            subject: recipient.subject,
            replyTo: REPLY_TO,
            text: `${recipient.body}\n\n---\nStop these: ${url}`,
            html: wrap(recipient.body, recipient.unsubscribeToken, recipient.media),
            headers: {
              "List-Unsubscribe": `<${url}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          };
        })
      );

      if (error) {
        failed += chunk.length;
        errors.push(error.message);
      } else {
        sent += data?.data?.length ?? chunk.length;
      }
    } catch (thrown) {
      failed += chunk.length;
      errors.push(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }

  // Deduplicated: a hundred copies of the same DNS error is not a hundred
  // different problems, and the campaign row has one text column for this.
  return { sent, failed, errors: [...new Set(errors)] };
}

/** Whether the newsletter can be sent at all, for the UI to say so up front. */
export const emailIsConfigured = () => !!KEY;

/**
 * Exactly what a customer will receive, rendered without sending anything.
 *
 * The same `wrap()` the sender uses — not a re-implementation, which would
 * drift and then reassure somebody about an email that no longer looks like
 * this. That is the whole point of a preview.
 *
 * The unsubscribe token is a visible dummy: the preview's footer link must not
 * be clickable-into-a-real-unsubscribe, and a token that reads as a placeholder
 * is clearer than one that looks real.
 */
export const PREVIEW_TOKEN = "preview-token-not-a-real-unsubscribe";

export function renderPreview(body: string, media?: EmailMedia): string {
  return wrap(body, PREVIEW_TOKEN, media);
}

/** The plain-text half, which is what many people actually see. */
export function renderPreviewText(body: string): string {
  return `${body}\n\n---\nStop these: ${unsubscribeUrl(PREVIEW_TOKEN)}`;
}

/** The From/Reply-to a recipient will see, for the preview header. */
export const senderIdentity = () => ({ from: FROM, replyTo: REPLY_TO ?? null });
