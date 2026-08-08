/**
 * Next's server-side instrumentation hook.
 *
 * `onRequestError` is the load-bearing export here. It is the only thing that
 * catches an error thrown inside a nested server component — those never reach
 * a try/catch, never reach an error boundary the SDK can see, and before this
 * existed they surfaced as a bare 500 with nothing anywhere to say why.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
