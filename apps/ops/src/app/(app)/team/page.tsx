import { requireStaff, supabase } from "@/lib/supabase";
import { getRecentActivity } from "@/lib/queries";
import { canManageTeam, ROLE_LABELS, type AppRole } from "@takemore/core";
import { Panel } from "@takemore/ui";
import type { PersonRow } from "@/lib/activity";
import TeamActivity from "./TeamActivity";
import TeamManager from "./TeamManager";

export const dynamic = "force-dynamic";

/**
 * The people, and what the people did.
 *
 * These were two screens: /team, owner-only, for who may sign in; and
 * /activity, staff-readable, for what has happened to stock. They were one
 * question asked twice — an owner checking whether a price drop was Sipho or
 * Thabo had to hold a roster on one page and a timeline on another — so they
 * are now one tab, with the roster above and the timeline below it.
 *
 * The merge does not widen anything. Managing the team is still owner-only, and
 * a non-owner reaching this page sees exactly what they could see before: the
 * roster (which "staff read the team" has always shown them, and which is what
 * puts a name against every log line) and the log itself. What is new is that
 * the log now says the name in the sentence rather than in a footnote.
 *
 * /activity 307s here — see next.config.mjs.
 */
export default async function TeamPage() {
  const client = await supabase();
  const [staff, { data }, entries] = await Promise.all([
    requireStaff(),
    client
      .from("staff_profiles")
      .select("user_id, full_name, role, active, approved_at, created_at")
      .order("created_at"),
    // 150 rows is roughly a fortnight of a busy workshop and one screen of
    // scrolling. The whole table would render just as happily and nobody would
    // read the bottom of it.
    getRecentActivity(150),
  ]);

  const everyone = data ?? [];
  const manages = canManageTeam(staff.role);

  // Split here rather than in the component so the page can say how many are
  // waiting in its own subtitle — the first thing an owner opening this screen
  // needs to know is whether anything is asking for them.
  const requests = everyone.filter((member) => !member.approved_at);
  const members = everyone.filter((member) => member.approved_at);

  // One read serves both halves: the roster is also the name for every actor_id
  // in the log, which is why the timeline costs no extra query.
  const people: PersonRow[] = everyone.map((member) => ({
    id: member.user_id,
    name: member.full_name,
    role: member.role as AppRole,
  }));

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">Team</h1>
        <p className="text-sm font-light text-muted mt-1">
          {manages && requests.length > 0
            ? `${requests.length} ${
                requests.length === 1 ? "person is" : "people are"
              } waiting for you to let them in.`
            : "Who is on the team, and what everybody has been doing."}
        </p>
      </header>

      <div className="space-y-4">
        {manages ? (
          <TeamManager
            requests={requests}
            members={members}
            currentUserId={staff.userId}
          />
        ) : (
          <Roster members={members} currentUserId={staff.userId} />
        )}

        <TeamActivity entries={entries} people={people} />
      </div>
    </div>
  );
}

/**
 * The same list without the controls, for everybody who is not the owner.
 *
 * Read-only because every write on this screen is owner-only at the policy
 * level — showing a role picker that the database would refuse is worse than
 * showing none. Deactivated people stay listed, struck through: their name is
 * still on log entries from when they worked here.
 */
function Roster({
  members,
  currentUserId,
}: {
  members: { user_id: string; full_name: string; role: AppRole; active: boolean }[];
  currentUserId: string;
}) {
  return (
    <Panel title="Everyone">
      <ul className="divide-y divide-white/5">
        {members.map((member) => (
          <li key={member.user_id} className="flex items-baseline gap-3 py-3">
            <p
              className={`text-sm font-light min-w-0 flex-1 truncate ${
                member.active ? "" : "text-muted line-through"
              }`}
            >
              {member.full_name}
              {member.user_id === currentUserId && (
                <span className="text-[11px] text-muted ml-2 no-underline">you</span>
              )}
            </p>
            <span className="text-[11px] font-light text-muted shrink-0">
              {ROLE_LABELS[member.role]}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
