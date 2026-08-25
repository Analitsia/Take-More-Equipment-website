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
  // The queue count rides alongside the auth check rather than after it — it
  // needs no role to run (any staff member may work the queue, and RLS answers
  // zero to anyone who may not), so paying for it sequentially was pure
  // latency on every request. `head: true` fetches the count without the rows.
  // Only the owner can act on a request, so only the owner pays for the count.
  // A partial index on (created_at) where approved_at is null makes this a scan
  // of the requests themselves rather than of the team. It chains off the auth
  // check (the role decides whether to ask at all) but rides in the same
  // Promise.all, so it overlaps the queue count instead of waiting behind it.
  const staffPromise = requireStaff();
  const [staff, queuedCount, pendingCount] = await Promise.all([
    staffPromise,
    countQueuedOutreach(),
    staffPromise.then(async (s) => {
      if (!canManageTeam(s.role)) return 0;
      const client = await supabase();
      const { count } = await client
        .from("staff_profiles")
        .select("user_id", { count: "exact", head: true })
        .is("approved_at", null);
      return count ?? 0;
    }),
  ]);

  return (
    <Shell staff={staff} pendingCount={pendingCount} queuedCount={queuedCount}>
      {children}
    </Shell>
  );
}
