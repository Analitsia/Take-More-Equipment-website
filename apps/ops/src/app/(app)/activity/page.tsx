import Link from "next/link";
import { requireStaff } from "@/lib/supabase";
import { getRecentActivity, getStaffNames } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Who changed what.
 *
 * activity_log has existed since the first week and nothing rendered it beyond
 * the last twenty lines on a single item's page. It is written by a SECURITY
 * DEFINER trigger rather than by application code — "because application code
 * forgets" — and it has no insert, update or delete policy for anybody, so
 * nothing in this app can rewrite it after the fact.
 *
 * That makes it the one place that can answer "who dropped the price on that
 * fryer" without anybody having to have remembered to write it down. This page
 * is a pure read; there is deliberately no corresponding write anywhere.
 *
 * Staff-readable rather than manager-only, on purpose: the log carries no cost
 * data (items has no cost columns, and cost rows are never logged), so there is
 * nothing here a staff member cannot already see — and a team that can see what
 * everybody did is a team that trusts the record.
 */

const ACTION_LOOK: Record<string, { icon: string; tone: string }> = {
  created: { icon: "solar:add-square-linear", tone: "text-muted" },
  published: { icon: "solar:global-linear", tone: "text-accent" },
  unpublished: { icon: "solar:eye-closed-linear", tone: "text-muted" },
  status_changed: { icon: "solar:refresh-linear", tone: "text-status-refurbishing" },
  price_changed: { icon: "solar:tag-price-linear", tone: "text-accent" },
  deleted: { icon: "solar:trash-bin-trash-linear", tone: "text-status-sold" },
};

/** "4 minutes ago" beats a timestamp for anything that happened today. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/** Group by calendar day, so a scroll has landmarks in it. */
function dayOf(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return "Today";
  if (same(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
}

export default async function ActivityPage() {
  await requireStaff();

  const [entries, names] = await Promise.all([getRecentActivity(150), getStaffNames()]);

  const days: { day: string; rows: typeof entries }[] = [];
  for (const entry of entries) {
    const day = dayOf(entry.created_at);
    const last = days[days.length - 1];
    if (last?.day === day) last.rows.push(entry);
    else days.push({ day, rows: [entry] });
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">Activity</h1>
        <p className="text-sm font-light text-muted mt-1">
          Everything that has happened to stock, newest first. Written
          automatically and cannot be edited.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm font-light text-muted bg-card border border-border rounded-2xl p-8 text-center">
          Nothing has happened yet.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {days.map(({ day, rows }) => (
            <section key={day}>
              <h2 className="text-[10px] uppercase tracking-wider text-muted mb-2 px-1">{day}</h2>
              <div className="bg-card border border-border rounded-2xl divide-y divide-white/5">
                {rows.map((entry) => {
                  const look = ACTION_LOOK[entry.action] ?? {
                    icon: "solar:pen-linear",
                    tone: "text-muted",
                  };
                  const who = entry.actor_id ? names.get(entry.actor_id) : null;

                  const body = (
                    <div className="flex items-start gap-3 px-4 py-3">
                      <span
                        className={`w-7 h-7 shrink-0 rounded-lg border border-border flex items-center justify-center ${look.tone}`}
                      >
                        <iconify-icon icon={look.icon} width="14" height="14"></iconify-icon>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-light leading-snug">{entry.summary}</p>
                        <p className="text-[11px] font-light text-muted mt-0.5">
                          {/* A deleted staff account leaves actor_id null — the
                              foreign key is ON DELETE SET NULL — so the entry
                              survives the person. Say so rather than showing a
                              blank. */}
                          {who ?? (entry.actor_id ? "a former team member" : "the system")} ·{" "}
                          {ago(entry.created_at)}
                        </p>
                      </div>
                    </div>
                  );

                  return entry.entity === "item" && entry.entity_id ? (
                    <Link
                      key={entry.id}
                      href={`/items/${entry.entity_id}`}
                      className="block hover:bg-white/[0.02] transition-colors"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div key={entry.id}>{body}</div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
