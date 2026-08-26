import type { MetadataRoute } from "next";
import { site } from "@/data/site";

/**
 * Crawl everything a visitor can see; nothing a visitor cannot.
 *
 * /api/ is JSON for the site's own overlays, /unsubscribe is a per-person
 * link that already carries noindex, and /monitoring is the Sentry tunnel.
 * The sitemap URL uses the same domain as metadataBase in layout.tsx.
 *
 * Preview and local deployments are additionally marked noindex in the root
 * metadata, so this file can stay the same in every environment.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/unsubscribe", "/monitoring"] }],
    sitemap: `https://${site.domain}/sitemap.xml`,
  };
}
