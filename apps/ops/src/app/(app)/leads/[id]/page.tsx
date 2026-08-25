import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/supabase";
import { getLead, getLeadEvents, getStockForWants } from "@/lib/leads";
import { getCategories, getSubcategories, getTags } from "@/lib/queries";
import LeadEditor from "./LeadEditor";

export const dynamic = "force-dynamic";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // One round for everything that needs only the id from the URL. The stock
  // lookup is the exception — it needs the lead's interests in hand first — so
  // it chains off the lead fetch inside the same Promise.all rather than
  // holding a second round hostage for the reference data too.
  //
  // Only the wants still being watched. A fulfilled interest is history, and
  // offering to email somebody about a machine answering a want they already
  // satisfied is exactly the kind of thing that makes staff stop trusting this.
  const leadPromise = getLead(id);
  const [staff, lead, events, categories, subcategories, tags, stock] = await Promise.all([
    requireStaff(),
    leadPromise,
    getLeadEvents(id),
    getCategories(),
    getSubcategories(),
    getTags(),
    leadPromise.then((l) =>
      getStockForWants(
        (l?.interests ?? []).filter((interest) => interest.active).map((i) => i.id)
      )
    ),
  ]);
  if (!lead) notFound();

  return (
    <div className="max-w-4xl">
      <Link
        href="/leads"
        className="inline-flex items-center gap-2 text-xs font-light text-muted hover:text-white transition-colors mb-4"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="14" height="14" noobserver="" />
        Everyone
      </Link>

      <LeadEditor
        lead={lead}
        events={events}
        categories={categories}
        subcategories={subcategories}
        tags={tags}
        stock={stock}
        role={staff.role}
      />
    </div>
  );
}
