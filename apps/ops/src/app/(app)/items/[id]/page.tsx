import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getActivity,
  getCategories,
  getCosts,
  getEconomics,
  getFeaturedCount,
  getItem,
  getSubcategories,
  getTags,
} from "@/lib/queries";
import { getLeadsWantingItem } from "@/lib/leads";
import { requireStaff } from "@/lib/supabase";
import { canSeeCosts } from "@takemore/core";
import ItemEditor from "./ItemEditor";
import WhoWantsThis from "./WhoWantsThis";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The record rides alongside the auth check — RLS answers it on its own, and
  // the role only matters for the second round of queries below.
  const [staff, item] = await Promise.all([requireStaff(), getItem(id)]);
  if (!item) notFound();

  const showCosts = canSeeCosts(staff.role);

  // Costs and margin are not merely hidden from staff in the UI — the queries
  // return nothing for them by policy. Skipping the fetch entirely keeps the
  // intent obvious at the call site.
  const [
    categories,
    subcategories,
    tags,
    costs,
    economics,
    activity,
    wanting,
    featuredCount,
  ] = await Promise.all([
    getCategories(),
    getSubcategories(),
    getTags(),
    showCosts ? getCosts(id) : Promise.resolve([]),
    showCosts ? getEconomics(id) : Promise.resolve(null),
    getActivity(id),
    getLeadsWantingItem(id),
    getFeaturedCount(),
  ]);

  return (
    <div className="max-w-5xl">
      <Link
        href="/items"
        className="inline-flex items-center gap-1.5 text-xs font-light text-muted hover:text-white transition-colors mb-4"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="14" height="14" noobserver="" />
        Stock
      </Link>

      <ItemEditor
        item={item}
        categories={categories}
        subcategories={subcategories}
        tags={tags}
        costs={costs}
        economics={economics}
        activity={activity}
        role={staff.role}
        featuredCount={featuredCount}
      />

      {/* Below the editor rather than beside it: this is context for a decision
          already being made, not a control. It renders nothing when nobody is
          waiting, which is most of the time. */}
      <div className="mt-4">
        <WhoWantsThis
          itemId={id}
          // The same three conditions match_item_to_leads() checks before it
          // will queue anything about a machine, and deliverEmail() re-checks
          // at the moment of sending. Withholding the button is the courtesy;
          // those two are the rule.
          sellable={
            item.status === "listed" &&
            item.published_at !== null &&
            (item.list_price_cents ?? 0) > 0
          }
          leads={wanting}
        />
      </div>
    </div>
  );
}
