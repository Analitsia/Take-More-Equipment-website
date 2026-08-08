"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatPhone, normalisePhone, rands } from "@takemore/core";
import type { LeadRow } from "@/lib/leads";

/**
 * Somebody has walked in. Who are they, and what did they want?
 *
 * This is the single most valuable screen in the CRM and the reason the rest of
 * it exists. A worker types the last four digits off a missed call, or the first
 * few letters of a name, and gets the answer before the customer has finished
 * crossing the floor.
 *
 * Not a page. It sits at the top of Today, because a screen you have to navigate
 * to is a screen nobody opens while somebody is standing in front of them.
 *
 * Everything is in memory. The alternative — a query per keystroke — is slower
 * at this scale and fails completely on the warehouse's patchy signal, which is
 * exactly when it is needed.
 */
export default function CounterLookup({ leads }: { leads: LeadRow[] }) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];

    // "0821234567" and "+27 82 123 4567" have to find the same person, so the
    // typed term is normalised the same way the stored column is.
    const asPhone = normalisePhone(query);
    const digits = term.replace(/\D/g, "");

    return leads
      .filter((lead) => {
        if (digits.length >= 3) {
          const stored = (lead.phone_e164 ?? lead.phone ?? "").replace(/\D/g, "");
          if (stored.includes(digits)) return true;
          if (asPhone && lead.phone_e164 === asPhone) return true;
        }
        return [lead.full_name, lead.business_name, lead.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .slice(0, 6);
  }, [leads, query]);

  return (
    <section className="bg-card border border-border rounded-2xl p-4 sm:p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <iconify-icon
          icon="solar:user-check-rounded-linear"
          width="16"
          height="16"
          noobserver=""
          className="text-accent"
        />
        <h2 className="text-sm font-medium tracking-tight">Somebody at the counter?</h2>
      </div>

      <div className="relative">
        <iconify-icon
          icon="solar:magnifer-linear"
          width="16"
          height="16"
          noobserver=""
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Last digits of their number, or their name"
          className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm font-light
                     text-white/90 placeholder:text-muted/60 hover:border-white/20
                     focus:border-accent focus:outline-none transition-colors"
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="mt-3">
          {matches.length === 0 ? (
            <p className="text-xs font-light text-muted py-2">
              Nobody by that. They are new —{" "}
              <Link href="/leads" className="text-white/80 hover:text-accent transition-colors">
                add them
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2">
              {matches.map((lead) => {
                const wants = lead.interests.filter((i) => i.active);
                return (
                  <li key={lead.id}>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="block bg-background border border-border rounded-xl p-3
                                 hover:border-accent/40 transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium tracking-tight truncate">
                          {lead.full_name || lead.email || formatPhone(lead.phone)}
                        </span>
                        <span className="text-[11px] font-light text-muted shrink-0 tabular-nums">
                          {formatPhone(lead.phone)}
                        </span>
                      </div>

                      {/* The whole point: what they asked for, in their words,
                          before you have to ask them to repeat it. */}
                      {wants.length === 0 ? (
                        <p className="text-[11px] font-light text-muted mt-1">
                          Nothing recorded yet
                        </p>
                      ) : (
                        <ul className="mt-1.5 space-y-0.5">
                          {wants.slice(0, 3).map((want) => (
                            <li
                              key={want.id}
                              className="text-[11px] font-light text-white/75 leading-relaxed"
                            >
                              <span className="text-accent">·</span>{" "}
                              {[
                                want.subcategory?.name ?? want.category?.name,
                                want.description,
                                want.budget_max_cents
                                  ? `up to ${rands(want.budget_max_cents)}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" — ")}
                            </li>
                          ))}
                        </ul>
                      )}

                      {lead.notes && (
                        <p className="text-[11px] font-light text-muted mt-1.5 line-clamp-2">
                          {lead.notes}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
