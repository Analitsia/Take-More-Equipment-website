import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return undefined;
  }
})();

const nextConfig = {
  // Workspace packages are consumed as TypeScript source — no build step, no
  // dist/ to go stale.
  transpilePackages: [
    "@takemore/core",
    "@takemore/db",
    "@takemore/ui",
    "@takemore/observability",
  ],
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost }]
      : [],
  },
  /**
   * /money was folded into the Dashboard.
   *
   * Not permanent (308): this is an internal tool behind a login, the URL is in
   * people's history and pinned tabs rather than anywhere a crawler cares
   * about, and a 308 is cached by the browser forever — which would be
   * unpleasant if the name is ever wanted back for something else.
   */
  async redirects() {
    return [{ source: "/money", destination: "/", permanent: false }];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  // Absent auth token = no source-map upload and a build that still succeeds.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  webpack: { treeshake: { removeDebugLogging: true } },
  tunnelRoute: "/monitoring",
});
