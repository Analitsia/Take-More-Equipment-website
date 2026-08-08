"use server";

import { headers } from "next/headers";
import { createPublicClient } from "@takemore/db";
import { normalisePhone } from "@takemore/core";
import { callerIp, turnstileMessage, verifyTurnstile } from "@takemore/core/turnstile";
import { reportError, reportMessage, reportOnce } from "@takemore/observability";

/**
 * The storefront's only write.
 *
 * Everything else this app does is a read of `public_items`. This goes through
 * public.capture_lead(), a SECURITY DEFINER function that returns void — the
 * anon role has no policy and no grant on `leads` at all, so there is no table
 * here to widen by mistake and no insert that could read a row back.
 *
 * It runs as a server action rather than from the browser, which buys two
 * things: the request arrives from Vercel rather than from the visitor, and the
 * honeypot below is checked somewhere a bot cannot skip.
 */

export type EnquiryResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Postgres speaks to developers; this speaks to somebody standing in a kitchen
 * deciding whether to bother. Anything unrecognised becomes an apology and a
 * phone number, never a stack trace.
 */
const humanise = (message: string): string => {
  if (message.includes("email address or a phone number")) {
    return "We need an email address so we can reply.";
  }
  if (message.includes("does not look right")) {
    return "That email address does not look right — mind checking it?";
  }
  if (message.includes("already have your enquiry")) {
    return "We already have this one — we will be in touch shortly.";
  }
  if (message.includes("a lot of enquiries")) {
    return "We are getting a lot of enquiries right now. Please try again in a few minutes, or WhatsApp us.";
  }
  return "Something went wrong on our side. Please WhatsApp us instead — we always answer that.";
};

export async function submitEnquiry(
  _previous: EnquiryResult | null,
  formData: FormData
): Promise<EnquiryResult> {
  const read = (key: string) => (formData.get(key) as string | null)?.trim() ?? "";

  // The honeypot. A field positioned off-screen and hidden from assistive
  // technology, which a person therefore never sees and a form-filling bot
  // almost always completes. Answering with a cheerful success is deliberate —
  // an error would tell whoever wrote the bot exactly what to change.
  if (read("website")) return { ok: true, message: "Thanks — we will be in touch." };

  /**
   * The bot check.
   *
   * DELIBERATELY NOT the honeypot's cheerful-success treatment. Silence is
   * right for the honeypot because only a bot ever sees that field, so nobody
   * real is harmed by it. Turnstile has false positives — a VPN, a hardened
   * browser, a bad afternoon on Cloudflare's side — and telling a real person
   * "thanks, we will be in touch" while dropping their enquiry on the floor is
   * the worst outcome available here. Every failure says what happened and
   * names the WhatsApp fallback.
   *
   * Note this does not protect capture_lead() itself, which anon can still call
   * directly over PostgREST. That is what the SQL ceilings in
   * 20260809090100_lead_capture_ceilings.sql are for. This raises the cost of
   * the easy path; those bound the hard one.
   */
  const verdict = await verifyTurnstile(read("cf-turnstile-response"), callerIp(await headers()));
  if (!verdict.ok) {
    if (verdict.reason === "not-configured") {
      // Production, with no key set. The form is offline by design, and that
      // must be loud — a silent unguarded form is the failure this prevents.
      reportOnce("turnstile-unconfigured", "Turnstile is not configured in production", {
        where: "web/submitEnquiry",
      });
    } else if (verdict.reason !== "missing-token") {
      reportMessage(`Turnstile ${verdict.reason}`, { where: "web/submitEnquiry" }, "info");
    }
    return { ok: false, error: turnstileMessage(verdict.reason) };
  }

  const email = read("email");
  const phone = read("phone");

  // capture_lead() itself accepts either an email or a phone number, because a
  // worker taking a WhatsApp number at the counter has no email to give it.
  // Every form on the website asks for the email, though, so this path requires
  // it — and requiring it here means the failure is a sentence on the form
  // rather than a Postgres exception translated after the fact.
  if (!email) {
    return { ok: false, error: "We need an email address so we can reply." };
  }
  if (phone && !normalisePhone(phone)) {
    return { ok: false, error: "That phone number does not look complete." };
  }

  const client = createPublicClient();
  const { error } = await client.rpc("capture_lead", {
    p_email: email,
    p_name: read("name") || undefined,
    p_phone: phone || undefined,
    p_message: read("message"),
    // A slug, never an id, and resolved server-side against published stock —
    // so this cannot be used to attach a stranger to an unlisted machine.
    p_item_slug: read("itemSlug") || undefined,
    p_category_slug: read("categorySlug") || undefined,
    p_from_product: formData.get("fromProduct") === "1",
    p_email_consent: formData.get("emailConsent") === "on",
    p_whatsapp_consent: formData.get("whatsappConsent") === "on",
  });

  if (error) {
    // Logged in full for us, summarised for them. A failed enquiry is a lost
    // sale, so it must be findable afterwards. The customer's own details are
    // deliberately not attached to the report — the message and the item slug
    // are enough to reproduce it, and the reporter scrubs them anyway.
    reportError(error, { where: "web/submitEnquiry", itemSlug: read("itemSlug") || null });
    return { ok: false, error: humanise(error.message) };
  }

  return {
    ok: true,
    message: read("itemSlug")
      ? "Got it. We will message you the moment we have one."
      : "Got it. We will be in touch as soon as something matches.",
  };
}
