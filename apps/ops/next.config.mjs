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
  experimental: {
    /**
     * Let the browser reuse a page it rendered less than thirty seconds ago.
     *
     * Next 15 turned this off for dynamic pages, which is correct for a
     * storefront and wrong for this app: flicking between Stock and a machine
     * and back is the single most common movement here, and re-rendering the
     * list on the server every time made the sidebar feel broken.
     *
     * Thirty seconds is safe because every write in the app goes through a
     * server action that calls revalidatePath(), which drops this cache along
     * with the server's — your own edit is never stale. What CAN be thirty
     * seconds old is a colleague's edit, and the Dashboard already accepts
     * sixty for that with its own refresh timer.
     */
    staleTimes: { dynamic: 30 },
  },
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
