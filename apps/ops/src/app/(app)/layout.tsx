import Shell from "@/components/Shell";
import { requireStaff } from "@/lib/supabase";

/**
 * Everything inside this group requires a staff session.
 *
 * requireStaff() redirects rather than rendering an error, and it re-checks
 * staff_profiles on every request — so removing someone's access takes effect
 * on their next navigation, not on their next token refresh.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return <Shell staff={staff}>{children}</Shell>;
}
