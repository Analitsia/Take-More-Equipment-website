/**
 * Next's server-side instrumentation hook, ops.
 *
 * `onRequestError` matters more here than on the storefront. Every page under
 * (app)/ is a server component doing a Supabase read; a thrown error in one of
 * them is a blank screen for somebody standing at a counter, and until now it
 * left no trace anywhere.
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
