/**
 * Sentry, edge runtime, ops. This is where middleware.ts runs, which handles
 * the session cookie on every request — hence the cookie scrub.
 * Same posture as sentry.server.config.ts.
 */
import * as Sentry from "@sentry/nextjs";
import { scrub } from "@takemore/observability";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
    if (event.request?.data) {
      event.request.data = scrub(event.request.data) as typeof event.request.data;
    }
    if (event.request?.query_string) delete event.request.query_string;
    if (event.request?.cookies) delete event.request.cookies;
    delete event.user;
    return event;
  },
});
