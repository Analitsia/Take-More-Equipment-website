import "server-only";

/**
 * Can the enquiry form actually be submitted on this deployment?
 *
 * `verifyTurnstile()` fails CLOSED in production when TURNSTILE_SECRET_KEY is
 * unset, and the widget renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is
 * unset. Either half missing in production means a visitor fills in the whole
 * form and is then told it is unavailable — or, with only the site key gone,
 * is told to "complete the check" that never appeared. Both are decided here,
 * once, on the server, so every page that mounts the form can show the
 * WhatsApp fallback INSTEAD of a form that cannot succeed.
 *
 * Outside production the server action waves submissions through without a
 * secret, so the form is always usable there.
 */
export function enquiryFormEnabled(): boolean {
  if (process.env.VERCEL_ENV !== "production") return true;
  return !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}
