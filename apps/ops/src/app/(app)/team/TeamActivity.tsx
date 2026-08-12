"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ago,
  dayOf,
  lookFor,
  phraseFor,
  roleOf,
  type ActivityEntry,
  type People,
  type PersonRow,
} from "@/lib/activity";

/**
 * What everybody has been doing, and who "everybody" was.
 *
 * The log is written by a SECURITY DEFINER trigger and has no insert, update or
 * delete policy for anyone, so nothing in this app can rewrite it after the
 * fact. This component is a pure read of it; there is deliberately no
 * corresponding write anywhere.
 *
 * Client-side rather than server-side because of the filter. The rows are
 * already on the page — filtering by person is a question somebody asks two or
 * three times in a row ("what did Thabo touch today?", "and Sipho?"), and a
 * round trip per question would make an answer feel like a page load. 150 rows
 * is nothing to hold in memory; a larger window would want a server query.
 *
 * Staff-readable rather than owner-only, on purpose: the log carries no cost
 * data (items has no cost columns, and cost rows are never logged), so there is
 * nothing here a staff member cannot already see — and a team that can see what
 * everybody did is a team that trusts the record.
 */
export default function TeamActivity({
  entries,
  people,
}: {
  entries: ActivityEntry[];
  /** The roster, flattened for the client boundary. */
  people: PersonRow[];
}) {
  const [actor, setActor] = useState<string | null>(null);

  const directory: People = useMemo(
    () => new Map(people.map((person) => [person.id, { name: person.name, role: person.role }])),
    [people]
  );

  /**
   * Only people who actually appear in this window get a chip.
   *
   * A roster of twelve with two of them in the log would otherwise offer ten
   * buttons that lead to an empty list. Ordered by how much they did, so the
   * person somebody is most likely looking for is first.
   */
  const doers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.actor_id && directory.has(entry.actor_id)) {
        counts.set(entry.actor_id, (counts.get(entry.actor_id) ?? 0) + 1);
      }
    }
    return [...counts]
      .map(([id, count]) => ({ id, count, name: directory.get(id)!.name }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [entries, directory]);

  const shown = actor ? entries.filter((entry) => entry.actor_id === actor) : entries;

  // Grouped after filtering, so a day with nothing left in it takes its heading
  // with it rather than leaving a dated gap.
  const days: { day: string; rows: ActivityEntry[] }[] = [];
  for (const entry of shown) {
    const day = dayOf(entry.created_at);
    const last = days[days.length - 1];
    if (last?.day === day) last.rows.push(entry);
    else days.push({ day, rows: [entry] });
  }

  return (
    <section>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3 px-1">
        <h2 className="text-sm font-medium tracking-tight">Activity</h2>
        <p className="text-[11px] font-light text-muted">
          Written automatically. Nobody can edit it.
        </p>
      </header>

      {doers.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
          <Chip label="Everyone" active={actor === null} onClick={() => setActor(null)} />
          {doers.map((person) => (
            <Chip
              key={person.id}
              label={person.name}
              count={person.count}
              active={actor === person.id}
              onClick={() => setActor(actor === person.id ? null : person.id)}
            />
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm font-light text-muted bg-card border border-border rounded-2xl p-8 text-center">
          {actor ? "Nothing from them yet." : "Nothing has happened yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {days.map(({ day, rows }) => (
            <div key={day}>
              <h3 className="text-[10px] uppercase tracking-wider text-muted mb-2 px-1">{day}</h3>
              <div className="bg-card border border-border rounded-2xl divide-y divide-white/5">
                {rows.map((entry) => {
                  const look = lookFor(entry.action);
                  const role = roleOf(entry, directory);

                  const body = (
                    <div className="flex items-start gap-3 px-4 py-3">
                      <span
                        className={`w-7 h-7 shrink-0 rounded-lg border border-border flex items-center justify-center ${look.tone}`}
                      >
                        <iconify-icon icon={look.icon} width="14" height="14"></iconify-icon>
                      </span>
                      <div className="min-w-0 flex-1">
                        {/* The name leads the sentence — see lib/activity.ts. */}
                        <p className="text-sm font-light leading-snug">
                          {phraseFor(entry, directory)}
                        </p>
                        <p className="text-[11px] font-light text-muted mt-0.5">
                          {role ? `${role} · ` : ""}
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** One person's name as a filter. Tapping the active one clears the filter. */
function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-light whitespace-nowrap
                  transition-colors ${
                    active
                      ? "border-accent text-accent bg-accent/10"
                      : "border-border text-white/70 hover:text-white hover:border-white/20"
                  }`}
    >
      {label}
      {count !== undefined && (
        <span className="text-muted ml-1.5 tabular-nums">{count}</span>
      )}
    </button>
  );
}
