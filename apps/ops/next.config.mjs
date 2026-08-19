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
  /**
   * The dev server and the production build get separate output directories.
   *
   * They used to share `.next`, and `npm run build` while `npm run dev` was
   * running would overwrite the chunks the running server still had in its
   * manifest. The symptom is not an error anybody would connect to a build:
   * the page renders as unstyled HTML, because the CSS asset 404s, alongside
   * `Cannot find module './3765.js'` from the webpack runtime. The fix used to
   * be "delete .next and restart", which is only obvious once you have lost an
   * afternoon to it.
   *
   * Next sets NODE_ENV before it loads this file — `next dev` is development,
   * `next build` and `next start` are production — so this splits them without
   * a flag anybody has to remember. Vercel runs `next build`, gets `.next`, and
   * is unaffected.
   */
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

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
   * /money was folded into the Dashboard, /activity into Team.
   *
   * Not permanent (308): this is an internal tool behind a login, the URLs are
   * in people's history and pinned tabs rather than anywhere a crawler cares
   * about, and a 308 is cached by the browser forever — which would be
   * unpleasant if either name is ever wanted back for something else.
   */
  async redirects() {
    return [
      { source: "/money", destination: "/", permanent: false },
      { source: "/activity", destination: "/team", permanent: false },
    ];
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
