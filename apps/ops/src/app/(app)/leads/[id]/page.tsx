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
  const staff = await requireStaff();

  const lead = await getLead(id);
  if (!lead) notFound();

  // Only the wants still being watched. A fulfilled interest is history, and
  // offering to email somebody about a machine answering a want they already
  // satisfied is exactly the kind of thing that makes staff stop trusting this.
  const watching = lead.interests.filter((interest) => interest.active).map((i) => i.id);

  const [events, categories, subcategories, tags, stock] = await Promise.all([
    getLeadEvents(id),
    getCategories(),
    getSubcategories(),
    getTags(),
    getStockForWants(watching),
  ]);

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
