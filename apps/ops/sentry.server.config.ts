/**
 * Sentry, server side, ops.
 *
 * Higher stakes than the storefront: this app holds every customer's name,
 * email, phone number and enquiry history. `sendDefaultPii: false` plus the
 * scrubbing below is what keeps an error report from becoming an export of the
 * CRM. See packages/observability/src/index.ts for the field list.
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
    // Server-action payloads arrive here, and those are lead forms.
    if (event.request?.query_string) delete event.request.query_string;
    if (event.request?.cookies) delete event.request.cookies;
    delete event.user;
    return event;
  },
});
