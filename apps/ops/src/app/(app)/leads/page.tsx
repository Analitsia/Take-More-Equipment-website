import { requireStaff } from "@/lib/supabase";
import { listLeads } from "@/lib/leads";
import { getCategories } from "@/lib/queries";
import LeadsBrowser from "./LeadsBrowser";
import NewLeadButton from "./NewLeadButton";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  // All three in one round: the data queries answer to RLS on their own, and
  // the redirect out of requireStaff() still fires before anything renders.
  const [, leads, categories] = await Promise.all([
    requireStaff(),
    listLeads(),
    getCategories(),
  ]);

  const reachable = leads.filter(
    (l) => !l.unsubscribed_at && (l.email_consent_at || l.whatsapp_consent_at)
  ).length;

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <div className="flex items-center space-x-3 mb-1">
          <div className="w-5 h-1 rounded-full bg-accent" />
          <span className="text-accent uppercase text-[11px] tracking-wider">Clients</span>
        </div>
        <h1 className="text-xl font-medium tracking-tight">
          {leads.length} {leads.length === 1 ? "client" : "clients"}
        </h1>
        <p className="text-xs font-light text-muted mt-1">
          {reachable} we may message about new stock.
        </p>
      </div>

      <div className="mb-4">
        <NewLeadButton
          categories={categories}
          className="inline-flex items-center gap-2 bg-accent text-background rounded-xl px-4 py-2.5
                     text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <iconify-icon icon="solar:user-plus-linear" width="18" height="18" noobserver="" />
          Add someone
        </NewLeadButton>
      </div>

      <LeadsBrowser leads={leads} categories={categories} />
    </div>
  );
}
