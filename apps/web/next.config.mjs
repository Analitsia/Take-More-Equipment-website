import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return undefined;
  }
})();

/**
 * Placeholder stock imagery, allowed everywhere EXCEPT production.
 *
 * The comment that used to sit here claimed "CI refuses a production deploy
 * that contains any" — and there was no CI. Worse, this list was never the
 * control it appeared to be: every placeholder image on the site is a plain
 * <img>, not next/image, so `remotePatterns` gated none of them.
 *
 * What actually enforces it now:
 *
 *   · scripts/check-launch-ready.mjs fails if any placeholder host appears
 *     anywhere in apps/web/src outside the launch manifest. That is the real
 *     gate, and it runs on every push and pull request.
 *   · apps/web/src/data/launch.ts refuses to build for production while the
 *     contact details are still the mockup ones.
 *   · A database trigger refuses to attach placeholder-flagged media to a
 *     published item.
 *
 * This list closing in production is the belt to those braces: if real
 * photography ever does get routed through next/image, a stock URL cannot be
 * silently optimised and served as though it were ours.
 */
const isProduction = process.env.VERCEL_ENV === "production";

const placeholderPatterns = isProduction
  ? []
  : [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "i.pravatar.cc" },
    ];

const nextConfig = {
  // Workspace packages are consumed as TypeScript source — no build step, no
  // dist/ to go stale.
  transpilePackages: ["@takemore/core", "@takemore/db", "@takemore/ui", "@takemore/observability"],
  images: {
    remotePatterns: [
      // Real item photography, served through Supabase's image transformer.
      ...(supabaseHost ? [{ protocol: "https", hostname: supabaseHost }] : []),
      ...placeholderPatterns,
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Quiet unless something is wrong, except in CI where the log is the record.
  silent: !process.env.CI,
  // Source maps are uploaded only when an auth token exists. Without one the
  // build still succeeds — which is exactly what lets CI build with no secrets.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  // Strips the SDK's own debug logging from the production bundle.
  webpack: { treeshake: { removeDebugLogging: true } },
  // Routes Sentry's own requests through this app's origin, so an ad blocker
  // cannot silently swallow error reports from real visitors.
  tunnelRoute: "/monitoring",
});
