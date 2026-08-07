import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getActivity,
  getCategories,
  getCosts,
  getEconomics,
  getItem,
  getTags,
} from "@/lib/queries";
import { requireStaff } from "@/lib/supabase";
import { canSeeCosts } from "@takemore/core";
import ItemEditor from "./ItemEditor";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaff();

  const item = await getItem(id);
  if (!item) notFound();

  const showCosts = canSeeCosts(staff.role);

  // Costs and margin are not merely hidden from staff in the UI — the queries
  // return nothing for them by policy. Skipping the fetch entirely keeps the
  // intent obvious at the call site.
  const [categories, tags, costs, economics, activity] = await Promise.all([
    getCategories(),
    getTags(),
    showCosts ? getCosts(id) : Promise.resolve([]),
    showCosts ? getEconomics(id) : Promise.resolve(null),
    getActivity(id),
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
        tags={tags}
        costs={costs}
        economics={economics}
        activity={activity}
        role={staff.role}
      />
    </div>
  );
}
