/**
 * Sentry in the browser, ops.
 *
 * No replays: this app is a customer database, and a recording of somebody
 * scrolling the leads list is an export of it.
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
