import { redirect } from "next/navigation";
import { requireStaff, supabase } from "@/lib/supabase";
import { canManageTeam } from "@takemore/core";
import TeamManager from "./TeamManager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const staff = await requireStaff();
  if (!canManageTeam(staff.role)) redirect("/");

  const client = await supabase();
  const { data } = await client
    .from("staff_profiles")
    .select("user_id, full_name, role, active, created_at")
    .order("created_at");

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">Team</h1>
        <p className="text-sm font-light text-muted mt-1">
          Who can sign in, and what they can see. There is no public sign-up —
          an account exists because you made it.
        </p>
      </header>

      <TeamManager members={data ?? []} currentUserId={staff.userId} />
    </div>
  );
}
