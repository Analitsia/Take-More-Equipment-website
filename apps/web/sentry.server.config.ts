/**
 * Sentry, server side, storefront.
 *
 * `enabled: Boolean(dsn)` is the ONLY place the DSN is checked. Everything
 * else — reportError(), captureException, the check-ins — calls straight
 * through, because the SDK is a no-op when it was never initialised. One
 * conditional, in the file whose job is configuration.
 */
import * as Sentry from "@sentry/nextjs";
import { scrub } from "@takemore/observability";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? "development",

  // Errors first. Performance tracing costs per-request overhead and buys very
  // little on a site this size; turn it up if and when there is a question it
  // would answer.
  tracesSampleRate: 0,

  // Non-negotiable. This app handles enquiry emails and phone numbers under
  // POPIA, and Sentry is a sub-processor named in the privacy notice. The less
  // it holds, the smaller that commitment.
  sendDefaultPii: false,

  beforeSend(event) {
    if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
    if (event.request?.data) {
      event.request.data = scrub(event.request.data) as typeof event.request.data;
    }
    // Query strings carry the unsubscribe token and the revalidate secret.
    if (event.request?.query_string) delete event.request.query_string;
    delete event.user;
    return event;
  },
});
