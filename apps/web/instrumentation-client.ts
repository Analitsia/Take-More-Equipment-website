/**
 * Sentry in the browser, storefront.
 *
 * This filename is the Next 15.3+ location for client init — not the old
 * `sentry.client.config.ts`, which is no longer picked up.
 *
 * Replays and performance tracing are both off. This is an error reporter, and
 * a session replay of somebody typing their email into an enquiry form is
 * exactly the personal information the privacy notice promises we minimise.
 */
import * as Sentry from "@sentry/nextjs";
import { scrub } from "@takemore/observability";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
    if (event.request?.query_string) delete event.request.query_string;
    delete event.user;
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
