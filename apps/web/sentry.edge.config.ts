/**
 * Sentry, edge runtime, storefront. Middleware and any edge route.
 * Same posture as sentry.server.config.ts — see that file for the reasoning.
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
    delete event.user;
    return event;
  },
});
