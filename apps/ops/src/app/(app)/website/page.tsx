import { requireStaff } from "@/lib/supabase";
import { storefrontOrigin } from "@/lib/storefront";
import SitePreview from "./SitePreview";

/**
 * The website, live, without leaving the app.
 *
 * Everything in this tool exists to put something on the storefront, and until
 * now the only way to see the result was to leave for a browser tab and come
 * back — which in practice means people publish and never look. A frame costs
 * one tap and keeps the nav, so checking your own work is cheap enough to
 * actually happen.
 *
 * It is the real site, not a mock: the same URL a customer gets, rendered by
 * the same deployment, so anything wrong here is wrong for them too.
 */

export const dynamic = "force-dynamic";

export default async function WebsitePage() {
  await requireStaff();

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <div className="flex items-center space-x-3 mb-1">
          <div className="w-5 h-1 rounded-full bg-accent" />
          <span className="text-accent uppercase text-[11px] tracking-wider">Live</span>
        </div>
        <h1 className="text-xl font-medium tracking-tight">Website</h1>
        <p className="text-xs font-light text-muted mt-1">
          What a customer sees right now.
        </p>
      </div>

      <SitePreview origin={storefrontOrigin()} />
    </div>
  );
}
