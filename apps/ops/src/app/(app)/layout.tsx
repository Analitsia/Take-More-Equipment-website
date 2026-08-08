import Shell from "@/components/Shell";
import { requireStaff, supabase } from "@/lib/supabase";
import { countQueuedOutreach } from "@/lib/leads";
import { canManageTeam } from "@takemore/core";

/**
 * Everything inside this group requires an approved staff session.
 *
 * requireStaff() redirects rather than rendering an error, and it re-checks
 * staff_profiles on every request — so removing someone's access takes effect
 * on their next navigation, not on their next token refresh. Someone who has
 * asked to join but not been let in yet is sent to /pending instead of /login,
 * because they have a perfectly good password and being told to sign in again
 * would only teach them to doubt it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();

  // Only the owner can act on a request, so only the owner pays for the count.
  // A partial index on (created_at) where approved_at is null makes this a scan
  // of the requests themselves rather than of the team.
  let pendingCount = 0;
  if (canManageTeam(staff.role)) {
    const client = await supabase();
    const { count } = await client
      .from("staff_profiles")
      .select("user_id", { count: "exact", head: true })
      .is("approved_at", null);
    pendingCount = count ?? 0;
  }

  // Everyone sees this one — any staff member may work the queue, because a
  // one-to-one message about a machine is part of serving a customer they are
  // already talking to. `head: true` fetches the count without the rows.
  const queuedCount = await countQueuedOutreach();

  return (
    <Shell staff={staff} pendingCount={pendingCount} queuedCount={queuedCount}>
      {children}
    </Shell>
  );
}
