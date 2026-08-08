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
    .select("user_id, full_name, role, active, approved_at, created_at")
    .order("created_at");

  const everyone = data ?? [];
  // Split here rather than in the component so the page can say how many are
  // waiting in its own subtitle — the first thing an owner opening this screen
  // needs to know is whether anything is asking for them.
  const requests = everyone.filter((member) => !member.approved_at);
  const members = everyone.filter((member) => member.approved_at);

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">Team</h1>
        <p className="text-sm font-light text-muted mt-1">
          {requests.length > 0
            ? `${requests.length} ${
                requests.length === 1 ? "person is" : "people are"
              } waiting for you to let them in.`
            : "Who can sign in, and what they can see."}
        </p>
      </header>

      <TeamManager
        requests={requests}
        members={members}
        currentUserId={staff.userId}
      />
    </div>
  );
}
