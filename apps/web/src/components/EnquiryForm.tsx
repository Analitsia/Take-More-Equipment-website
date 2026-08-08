"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Turnstile } from "@takemore/ui";
import { submitEnquiry, type EnquiryResult } from "@/app/actions/enquiry";
import { site } from "@/data/site";

/**
 * The form that keeps the enquiry.
 *
 * Every conversion point on this site is a wa.me link, which composes exactly
 * what a visitor wants into a message string and then forgets it. This sits
 * beside those links rather than replacing them — some people will always rather
 * just chat, and the WhatsApp button converts a ready buyer faster than any form
 * ever will.
 *
 * What it is actually for is the OTHER visitor: the one who is not ready today,
 * who would not start a chat, and who leaves without a trace. That person is the
 * majority of this page's traffic, and asking them for one field is the
 * difference between knowing they exist and not.
 *
 * Hence: EMAIL IS THE ONLY REQUIRED FIELD. Name and phone are offered, visible,
 * and optional. Staff fill the rest in when they speak to them.
 */

type Mode = "product" | "sold" | "general";

const CONTROL =
  "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-light " +
  "text-white/90 placeholder:text-muted/70 hover:border-white/20 " +
  "focus:border-accent focus:outline-none transition-colors";

const COPY: Record<Mode, { eyebrow: string; heading: string; blurb: string; cta: string }> = {
  product: {
    eyebrow: "Want one like this?",
    heading: "Tell us, and we will watch for the next one",
    blurb:
      "One of one — when this goes, it goes. Leave your email and we will message you the moment another comes through the workshop.",
    cta: "Keep me posted",
  },
  sold: {
    eyebrow: "This one has sold",
    heading: "We can find you another",
    blurb:
      "Machines like this come through most months. Leave your email and you will hear about the next one before it reaches this page.",
    cta: "Find me one",
  },
  general: {
    eyebrow: "Looking for something specific?",
    heading: "Tell us what you need",
    blurb:
      "Describe the machine and the number you have to hit. If it is not on the floor this week, we will watch for it and send you photos and a price.",
    cta: "Send it through",
  },
};

export default function EnquiryForm({
  mode = "general",
  itemSlug,
  itemTitle,
  categories = [],
  className = "",
}: {
  mode?: Mode;
  itemSlug?: string;
  itemTitle?: string;
  /** Offered as chips on the general form. Ignored on a product page, where the
   *  category is resolved from the item itself. */
  categories?: { slug: string; name: string }[];
  className?: string;
}) {
  const [state, action] = useActionState<EnquiryResult | null, FormData>(
    submitEnquiry,
    null
  );
  const [category, setCategory] = useState("");
  const id = useId();
  const copy = COPY[mode];
  const onProduct = mode === "product" || mode === "sold";

  /**
   * Bumped every time the form comes back with an error, to make the Turnstile
   * widget mint a fresh token.
   *
   * A Turnstile token is single-use, and this form stays mounted after a
   * failure. Without a reset the retry replays a spent token and fails again —
   * permanently, from the person's point of view, for a reason they could do
   * nothing about. Which is a far worse failure than the one it protects
   * against.
   */
  const [attempts, setAttempts] = useState(0);
  useEffect(() => {
    if (state && !state.ok) setAttempts((n) => n + 1);
  }, [state]);

  if (state?.ok) {
    return (
      <div
        className={`bg-card border border-accent/30 rounded-[2rem] p-6 sm:p-8 flex items-start gap-4 ${className}`}
      >
        <span className="w-10 h-10 shrink-0 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent">
          <iconify-icon icon="solar:check-read-linear" width="18" height="18"></iconify-icon>
        </span>
        <div>
          <h3 className="text-base font-medium tracking-tight mb-1">{state.message}</h3>
          <p className="text-xs font-light text-muted leading-relaxed">
            If it is urgent, WhatsApp us on {site.phone} — we always answer that faster.
          </p>
        </div>
      </div>
    );
  }

  return (
    /* `relative` so the off-screen honeypot below is positioned against this
       form rather than against the page, which would give the page a
       horizontal scrollbar on mobile. */
    <form
      action={action}
      className={`relative bg-card border border-border rounded-[2rem] p-6 sm:p-8 ${className}`}
    >
      <div className="flex items-center space-x-3 mb-3">
        <div className="w-5 h-1 rounded-full bg-accent" />
        <span className="text-accent uppercase text-xs tracking-wider font-normal">
          {copy.eyebrow}
        </span>
      </div>

      <h3 className="text-xl sm:text-2xl font-medium tracking-tight mb-3">{copy.heading}</h3>
      <p className="text-sm font-light text-muted leading-relaxed mb-6">{copy.blurb}</p>

      {/* Context the visitor never types. The slug is resolved server-side
          against published stock, so this is a hint, not a trusted input. */}
      {itemSlug && <input type="hidden" name="itemSlug" value={itemSlug} />}
      <input type="hidden" name="categorySlug" value={onProduct ? "" : category} />
      <input type="hidden" name="fromProduct" value={onProduct ? "1" : "0"} />

      {/* The honeypot. Off-screen rather than display:none — some bots skip
          fields they cannot render — and hidden from assistive technology so no
          real person is ever asked to fill it in. */}
      <div className="absolute left-[-9999px] top-auto w-px h-px overflow-hidden" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {/* One tap that turns a sentence of free text into something the stock
          matcher can actually join on. A category match scores thirty; the same
          words as loose text score eight. Optional, and tapping it again clears
          it — a chip you cannot un-pick is a chip people avoid. */}
      {!onProduct && categories.length > 0 && (
        <fieldset className="mb-4">
          <legend className="text-xs font-light text-muted mb-2">
            What kind of thing? <span className="text-muted/60">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {categories.map((option) => {
              const on = category === option.slug;
              return (
                <button
                  key={option.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategory(on ? "" : option.slug)}
                  className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors ${
                    on
                      ? "border-accent/70 bg-accent/10 text-accent"
                      : "border-border text-white/70 hover:border-white/25"
                  }`}
                >
                  {option.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="sr-only">Your email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@yourkitchen.co.za"
            className={CONTROL}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="sr-only">Your name</span>
            <input
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Your name (optional)"
              className={CONTROL}
            />
          </label>
          <label className="block">
            <span className="sr-only">Your phone number</span>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="082 123 4567 (optional)"
              className={CONTROL}
            />
          </label>
        </div>

        <label className="block">
          <span className="sr-only">What you are looking for</span>
          <textarea
            name="message"
            rows={onProduct ? 2 : 3}
            placeholder={
              onProduct
                ? `Anything else about the ${itemTitle ?? "machine"} you need? (optional)`
                : "What are you after? A six-burner, an under-counter fridge, a combi oven…"
            }
            className={`${CONTROL} resize-y leading-relaxed`}
          />
        </label>
      </div>

      {/* Consent. Unticked, one box per channel, naming the business.
          A pre-ticked box is not consent under POPIA s69, and Meta's opt-in
          policy separately requires that the sender be named. */}
      <fieldset className="mt-5 flex flex-col gap-2.5">
        <legend className="sr-only">How we may contact you</legend>
        <Consent name="emailConsent" id={`${id}-email-consent`}>
          Email me when {site.name} gets stock like this, and the monthly list of new
          arrivals.
        </Consent>
        <Consent name="whatsappConsent" id={`${id}-wa-consent`}>
          WhatsApp me too — it is usually faster.
        </Consent>
      </fieldset>

      {/* Bot check. Renders nothing at all when no site key is configured —
          local development and CI — so the form has no gap in it there.
          `resetKey` on the attempt count matters: a Turnstile token is
          single-use, and this form stays mounted after a failed submission, so
          without a reset the second attempt replays a spent token and is
          rejected for a reason the person cannot possibly act on. */}
      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        resetKey={attempts}
        className="mt-5"
      />

      {state && !state.ok && (
        <p className="mt-4 text-xs text-[#D47A85] bg-[#D47A85]/10 border border-[#D47A85]/30 rounded-xl px-3 py-2.5">
          {state.error}
        </p>
      )}

      <Submit label={copy.cta} />

      <p className="mt-4 text-[11px] font-light text-muted leading-relaxed">
        We only use this to tell you about equipment. Unsubscribe from any message.{" "}
        <a href="/privacy" className="text-white/80 hover:text-accent transition-colors underline underline-offset-2">
          How we handle your details
        </a>
        .
      </p>
    </form>
  );
}

function Consent({
  name,
  id,
  children,
}: {
  name: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer group">
      <input
        id={id}
        name={name}
        type="checkbox"
        className="mt-0.5 w-4 h-4 shrink-0 rounded border-border bg-background accent-accent cursor-pointer"
      />
      <span className="text-xs font-light text-muted leading-relaxed group-hover:text-white/80 transition-colors">
        {children}
      </span>
    </label>
  );
}

/** Split out so useFormStatus can see the pending state of the form above it. */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-5 w-full flex items-center justify-between gap-3 bg-accent text-background rounded-2xl px-6 py-4
        hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="text-sm font-medium">{pending ? "Sending…" : label}</span>
      {pending ? (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        <iconify-icon icon="solar:arrow-right-linear" width="18" height="18"></iconify-icon>
      )}
    </button>
  );
}
